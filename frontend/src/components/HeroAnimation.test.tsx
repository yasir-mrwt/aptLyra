import {render,screen,fireEvent,waitFor,cleanup,act} from "@testing-library/react";
import {it,expect,vi,afterEach} from "vitest";
import HeroAnimation from "./HeroAnimation";
const fixture=vi.hoisted(()=>({reduced:false,listeners:{} as Record<string,()=>void>,player:{play:vi.fn(),pause:vi.fn(),destroy:vi.fn(),goToAndPlay:vi.fn(),addEventListener:vi.fn()}}));
vi.mock("framer-motion",()=>({useReducedMotion:()=>fixture.reduced}));
vi.mock("lottie-web/build/player/lottie_light",()=>({default:{loadAnimation:()=>{fixture.player.addEventListener.mockImplementation((event:string,fn:()=>void)=>{fixture.listeners[event]=fn;});return fixture.player;}}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();fixture.reduced=false;fixture.listeners={};});
it("reduced motion shows the licensed static frame without fetching animation data",()=>{
 fixture.reduced=true;const fetch=vi.fn();vi.stubGlobal("fetch",fetch);render(<HeroAnimation/>);
 expect(screen.getByRole("img").getAttribute("src")).toBe("/animations/video-explainer-poster.svg");
 expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole("button")).toBeNull();
 expect(screen.getByRole("link",{name:"Animation license"}).getAttribute("href")).toBe("/animations/LICENSE.txt");
});
it("playback pauses, replays after its finite cycle, and destroys the renderer on unmount",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({layers:[]})}));
 const view=render(<HeroAnimation/>);await waitFor(()=>expect(fixture.listeners.DOMLoaded).toBeTruthy());
 act(()=>fixture.listeners.DOMLoaded());expect(fixture.player.play).toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Pause illustration"}));expect(fixture.player.pause).toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Play illustration"}));act(()=>fixture.listeners.complete());
 fireEvent.click(screen.getByRole("button",{name:"Replay illustration"}));expect(fixture.player.goToAndPlay).toHaveBeenCalledWith(0,true);
 view.unmount();expect(fixture.player.destroy).toHaveBeenCalled();
});
it("asset failure retains an accessible static illustration without a nonworking play control",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));render(<HeroAnimation/>);
 await act(async()=>{});expect(screen.getByRole("img").className).not.toContain("hidden-poster");expect(screen.queryByRole("button")).toBeNull();
});
