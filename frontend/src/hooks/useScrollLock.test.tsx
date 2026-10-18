import {renderHook,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {useScrollLock} from './useScrollLock';
afterEach(cleanup);
it('keeps the page locked when navigation closes behind the account dialog',()=>{
 document.body.style.overflow='auto';
 const nav=renderHook(()=>useScrollLock(true));const account=renderHook(()=>useScrollLock(true));
 nav.unmount();expect(document.body.style.overflow).toBe('hidden');
 account.unmount();expect(document.body.style.overflow).toBe('auto');
});
