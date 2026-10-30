import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {JsonDiagram} from './JsonDiagram';
import {renderStandard} from '../json/mermaidRenderer.mjs';
vi.mock('../json/mermaidRenderer.mjs',async importOriginal=>({...await importOriginal<object>(),renderStandard:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
const svg=(text:string)=>`<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`;

it('SR-22 late rendering of a replaced result never restores the old SVG',async()=>{
  vi.useFakeTimers();let old!:(svg:string)=>void,next!:(svg:string)=>void;
  vi.mocked(renderStandard).mockImplementationOnce(()=>new Promise(resolve=>old=resolve)).mockImplementationOnce(()=>new Promise(resolve=>next=resolve));
  const view=render(<JsonDiagram code={'flowchart TD\na[safe]'}/>);await act(()=>vi.advanceTimersByTimeAsync(300));
  view.rerender(<JsonDiagram code={'flowchart TD\nb[current]'}/>);await act(()=>vi.advanceTimersByTimeAsync(300));
  await act(async()=>next(svg('CURRENT')));expect(screen.getByText('CURRENT')).toBeVisible();
  await act(async()=>old(svg('OBSOLETE')));expect(screen.queryByText('OBSOLETE')).not.toBeInTheDocument();expect(screen.getByText('CURRENT')).toBeVisible();
});
it('SR-23 unmount during a render cannot restore a cleared diagram',async()=>{
  vi.useFakeTimers();let complete!:(svg:string)=>void;vi.mocked(renderStandard).mockImplementation(()=>new Promise(resolve=>complete=resolve));
  const view=render(<JsonDiagram code={'flowchart TD\na[safe]'}/>);await act(()=>vi.advanceTimersByTimeAsync(300));view.unmount();
  await act(async()=>complete(svg('OBSOLETE')));expect(screen.queryByText('OBSOLETE')).not.toBeInTheDocument();
});
it('SR-24 a failed diagram keeps its source, and explicit retry recovers the current code',async()=>{
  vi.useFakeTimers();vi.mocked(renderStandard).mockRejectedValueOnce(new Error('synthetic')).mockResolvedValueOnce(svg('RECOVERED'));
  render(<JsonDiagram code={'flowchart TD\na[safe]'}/>);await act(()=>vi.advanceTimersByTimeAsync(300));
  expect(screen.getByText('flowchart TD a[safe]')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'図を再試行'}));await act(()=>vi.advanceTimersByTimeAsync(300));
  expect(screen.getByText('RECOVERED')).toBeVisible();expect(vi.mocked(renderStandard).mock.calls[1][0]).toBe('flowchart TD\na[safe]');
});
it.each([51199,51200,51201])('SR-25 auto-render boundary %i bytes is separate from verified source availability',async bytes=>{
  vi.useFakeTimers();vi.mocked(renderStandard).mockResolvedValue(svg('SAFE'));
  const base='flowchart TD\na[safe]\n%%',code=base+' '.repeat(bytes-base.length);render(<JsonDiagram code={code}/>);await act(()=>vi.advanceTimersByTimeAsync(300));
  expect(renderStandard).toHaveBeenCalledTimes(bytes>51200?0:1);
  if(bytes>51200)expect(screen.getByText(/50 KiBを超える/)).toBeVisible();
});
