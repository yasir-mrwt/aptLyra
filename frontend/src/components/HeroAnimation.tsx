import {useEffect,useRef,useState} from "react";
import {useReducedMotion} from "framer-motion";
import type {AnimationItem} from "lottie-web";

/** The supplied Video Explainer asset; all visuals are local, licensed derivatives. */
export default function HeroAnimation(){
  const reduced=useReducedMotion();
  const container=useRef<HTMLDivElement>(null),player=useRef<AnimationItem|null>(null);
  const [ready,setReady]=useState(false),[playing,setPlaying]=useState(true),[ended,setEnded]=useState(false);
  const playingRef=useRef(true),visible=useRef(true),finished=useRef(false);
  useEffect(()=>{
    if(reduced || !container.current)return;
    const host=container.current,abort=new AbortController();let disposed=false;
    const syncPlayback=()=>{
      if(!player.current)return;
      if(playingRef.current&&visible.current&&!document.hidden&&!finished.current)player.current.play();
      else player.current.pause();
    };
    const observer=typeof IntersectionObserver==="undefined"?null:new IntersectionObserver(([entry])=>{visible.current=entry.isIntersecting;syncPlayback();},{threshold:.15});
    observer?.observe(host);document.addEventListener("visibilitychange",syncPlayback);
    void Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch("/animations/video-explainer-aptlyra.json",{signal:abort.signal}).then(r=>{if(!r.ok)throw Error("Animation unavailable");return r.json();}),
    ]).then(([module,animationData])=>{
      if(disposed)return;
      const animation=module.default.loadAnimation({container:host,renderer:"svg",loop:false,autoplay:false,animationData,rendererSettings:{preserveAspectRatio:"xMidYMid meet",progressiveLoad:true}});
      player.current=animation;
      animation.addEventListener("DOMLoaded",()=>{if(!disposed){setReady(true);syncPlayback();}});
      animation.addEventListener("complete",()=>{finished.current=true;playingRef.current=false;setPlaying(false);setEnded(true);});
      animation.addEventListener("data_failed",()=>{if(!disposed)setReady(false);});
    }).catch(()=>{ /* The same licensed static frame remains usable offline. */ });
    return()=>{disposed=true;abort.abort();observer?.disconnect();document.removeEventListener("visibilitychange",syncPlayback);player.current?.destroy();player.current=null;};
  },[reduced]);
  const toggle=()=>{
    if(!player.current)return;
    if(ended){finished.current=false;setEnded(false);playingRef.current=true;setPlaying(true);player.current.goToAndPlay(0,true);}
    else{playingRef.current=!playing;setPlaying(!playing);if(playing)player.current.pause();else player.current.play();}
  };
  return <figure className="hero-animation" aria-label="An illustrated video conversation: a speaker explains an idea at a desk.">
    <div className="hero-animation-stage">
      <img src="/animations/video-explainer-poster.svg" width="1024" height="1024" alt="A speaker explains an idea during a video conversation, with a laptop, plants and speech bubble." className={ready&&!reduced?"hero-poster hidden-poster":"hero-poster"} fetchPriority="high"/>
      <div ref={container} aria-hidden="true" className={reduced?"hero-lottie hidden-player":"hero-lottie"}/>
    </div>
    <figcaption>
      <span>Get comfortable explaining your thinking.</span>
      {!reduced&&ready&&<button type="button" onClick={toggle} aria-label={ended?"Replay illustration":playing?"Pause illustration":"Play illustration"}>{ended?"Replay":playing?"Pause":"Play"}<span aria-hidden="true">{playing?" Ⅱ":" ▷"}</span></button>}
    </figcaption>
    <p className="animation-credit"><a href="https://lottiefiles.com/free-animation/video-explainer-YUwaiFcnZ4" target="_blank" rel="noreferrer">Video Explainer · Sherjeel Javed</a><span aria-hidden="true"> · </span><a href="/animations/LICENSE.txt">Animation license</a></p>
  </figure>;
}
