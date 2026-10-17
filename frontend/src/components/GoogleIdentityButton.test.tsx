import {StrictMode} from 'react';
import {render,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import GoogleIdentityButton from './GoogleIdentityButton';
vi.mock('@react-oauth/google',()=>({useGoogleOAuth:()=>({clientId:'123-client.apps.googleusercontent.com',scriptLoadedSuccessfully:true})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('initializes once per nonce under StrictMode and delivers to the current callback',()=>{
 const initialize=vi.fn(),renderButton=vi.fn(),first=vi.fn(),second=vi.fn();
 Object.defineProperty(window,'google',{configurable:true,value:{accounts:{id:{initialize,renderButton}}}});
 const view=render(<StrictMode><GoogleIdentityButton nonce="first" onSuccess={first}/></StrictMode>);
 expect(initialize).toHaveBeenCalledTimes(1);
 view.rerender(<StrictMode><GoogleIdentityButton nonce="first" onSuccess={second} theme="filled_black"/></StrictMode>);
 expect(initialize).toHaveBeenCalledTimes(1);
 initialize.mock.calls[0][0].callback({credential:'test-only'});expect(second).toHaveBeenCalled();expect(first).not.toHaveBeenCalled();
 view.rerender(<GoogleIdentityButton nonce="fresh" onSuccess={second}/>);
 expect(initialize).toHaveBeenCalledTimes(2);expect(initialize.mock.calls[1][0].nonce).toBe('fresh');
});
