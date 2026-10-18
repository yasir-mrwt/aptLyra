import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ConfirmModal from './ConfirmModal';
afterEach(cleanup);
it('shows dark unanswered confirmation, traps focus, locks scroll and restores it',()=>{
 const cancel=vi.fn(),confirm=vi.fn();
 document.body.style.overflow='auto';
 const view=render(<ConfirmModal isOpen title="Finish interview?" message="2 unanswered" onCancel={cancel} onConfirm={confirm} cancelText="Review unanswered" confirmText="Finish without answering"/>);
 expect(screen.getByRole('dialog').className).toContain('bg-surface-900');
 const review=screen.getByRole('button',{name:'Review unanswered'}),finish=screen.getByRole('button',{name:'Finish without answering'});
 expect(document.activeElement).toBe(review);expect(document.body.style.overflow).toBe('hidden');
 fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(finish);
 fireEvent.keyDown(document,{key:'Tab'});expect(document.activeElement).toBe(review);
 fireEvent.click(review);expect(cancel).toHaveBeenCalledOnce();expect(confirm).not.toHaveBeenCalled();
 view.unmount();expect(document.body.style.overflow).toBe('auto');
});
it('keeps finish and review actions distinct with review as the primary action',()=>{
 const cancel=vi.fn(),confirm=vi.fn();
 render(<ConfirmModal isOpen reviewFirst title="Finish?" message="2 unanswered" onCancel={cancel} onConfirm={confirm} cancelText="Review unanswered" confirmText="Finish without answering"/>);
 expect(screen.getByRole('button',{name:'Review unanswered'}).className).toContain('bg-primary-600');
 fireEvent.click(screen.getByRole('button',{name:'Finish without answering'}));
 expect(confirm).toHaveBeenCalledOnce();expect(cancel).not.toHaveBeenCalled();
 expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe(screen.getByText('2 unanswered').id);
});
