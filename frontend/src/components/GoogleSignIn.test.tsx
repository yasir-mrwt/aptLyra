import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import GoogleSignIn from './GoogleSignIn';
const {get,google}=vi.hoisted(()=>({get:vi.fn(),google:vi.fn()}));
vi.mock('../services/apiClient',()=>({default:{get}}));
vi.mock('@react-oauth/google',()=>({GoogleOAuthProvider:({children,clientId}:{children:React.ReactNode;clientId:string})=><div data-testid="audience" data-client-id={clientId}>{children}</div>,GoogleLogin:(props:unknown)=>{google(props);return <button>Google identity</button>;}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('uses the verifier client ID and browser challenge nonce',async()=>{
 get.mockResolvedValue({data:{clientId:'123-backend.apps.googleusercontent.com',nonce:'browser-bound'}});
 render(<GoogleSignIn onSuccess={()=>{}}/>);await screen.findByRole('button',{name:'Google identity'});
 expect(screen.getByTestId('audience').getAttribute('data-client-id')).toBe('123-backend.apps.googleusercontent.com');
 expect(google).toHaveBeenCalledWith(expect.objectContaining({nonce:'browser-bound'}));
});
it('offers recovery when config is invalid without mounting a broken provider',async()=>{
 get.mockResolvedValueOnce({data:{clientId:'invalid',nonce:'nonce'}}).mockResolvedValueOnce({data:{clientId:'123-valid.apps.googleusercontent.com',nonce:'new'}});
 render(<GoogleSignIn onSuccess={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry Google'}));
 await waitFor(()=>expect(google).toHaveBeenCalledWith(expect.objectContaining({nonce:'new'})));
});
