import {useEffect,useRef,useState} from "react";
import {useReducedMotion} from "framer-motion";
import type {AnimationItem} from "lottie-web";

/** Licensed local artwork; no provider calls or tracking assets. */
export default function HeroAnimation(){
 const reduced=useReducedMotion(),container=useRef<HTMLDivElement>(null),player=useRef<AnimationItem|null>(null);
 const [ready,setReady]=useState(false);
 const visible=useRef(true),paused=useRef(false);
 const sync=()=>{if(visible.current&&!document.hidden&&!paused.current)player.current?.play();else player.current?.pause();};
 useEffect(()=>{
  if(reduced||!container.current)return;
  const host=container.current,abort=new AbortController();let disposed=false;
  const syncPlayback=()=>{if(visible.current&&!document.hidden&&!paused.current)player.current?.play();else player.current?.pause();};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(([entry])=>{visible.current=entry.isIntersecting;syncPlayback();},{threshold:.15});
  observer?.observe(host);document.addEventListener('visibilitychange',syncPlayback);
  void fetch('/animations/video-explainer-aptlyra.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(async animationData=>{
   const module=await import('lottie-web/build/player/lottie_light');if(disposed)return;
   const animation=module.default.loadAnimation({container:host,renderer:'svg',loop:true,autoplay:false,animationData,rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:true}});
   player.current=animation;
   animation.addEventListener('DOMLoaded',()=>{if(!disposed){setReady(true);syncPlayback();}});
   animation.addEventListener('data_failed',()=>{if(!disposed){setReady(false);animation.destroy();player.current=null;}});
  }).catch(()=>{/* Accessible static artwork stays visible. */});
  return()=>{disposed=true;abort.abort();observer?.disconnect();document.removeEventListener('visibilitychange',syncPlayback);player.current?.destroy();player.current=null;};
 },[reduced]);
 return <figure className="hero-animation" tabIndex={reduced?undefined:0} aria-label="Illustrated video conversation. Press Space to pause or resume motion." onKeyDown={event=>{if(event.key===' '){event.preventDefault();paused.current=!paused.current;sync();}}}>
  <div className="hero-animation-stage"><img src="/animations/video-explainer-poster.svg" width="1024" height="1024" alt="A speaker explains an idea during a video conversation, with a laptop and plants." className={ready&&!reduced?'hero-poster hidden-poster':'hero-poster'} fetchPriority="high"/><div ref={container} aria-hidden="true" className={reduced?'hero-lottie hidden-player':'hero-lottie'}/></div>
  <figcaption className="animation-credit"><a href="https://lottiefiles.com/free-animation/video-explainer-YUwaiFcnZ4" target="_blank" rel="noreferrer">Video Explainer · Sherjeel Javed</a><span aria-hidden="true"> · </span><a href="/animations/LICENSE.txt">Animation license</a></figcaption>
 </figure>;
}
