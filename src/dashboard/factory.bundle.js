(()=>{var vE=Object.create;var Y_=Object.defineProperty;var yE=Object.getOwnPropertyDescriptor;var xE=Object.getOwnPropertyNames;var SE=Object.getPrototypeOf,ME=Object.prototype.hasOwnProperty;var Ws=(e,t)=>()=>{try{return t||e((t={exports:{}}).exports,t),t.exports}catch(n){throw t=0,n}};var bE=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of xE(t))!ME.call(e,s)&&s!==n&&Y_(e,s,{get:()=>t[s],enumerable:!(i=yE(t,s))||i.enumerable});return e};var Z_=(e,t,n)=>(n=e!=null?vE(SE(e)):{},bE(t||!e||!e.__esModule?Y_(n,"default",{value:e,enumerable:!0}):n,e));var ov=Ws(Pt=>{"use strict";var op=Symbol.for("react.transitional.element"),EE=Symbol.for("react.portal"),TE=Symbol.for("react.fragment"),AE=Symbol.for("react.strict_mode"),wE=Symbol.for("react.profiler"),CE=Symbol.for("react.consumer"),RE=Symbol.for("react.context"),NE=Symbol.for("react.forward_ref"),DE=Symbol.for("react.suspense"),UE=Symbol.for("react.memo"),$_=Symbol.for("react.lazy"),LE=Symbol.for("react.activity"),OE=Symbol.for("react.view_transition"),J_=Symbol.iterator;function IE(e){return e===null||typeof e!="object"?null:(e=J_&&e[J_]||e["@@iterator"],typeof e=="function"?e:null)}var tv={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},ev=Object.assign,nv={};function wr(e,t,n){this.props=e,this.context=t,this.refs=nv,this.updater=n||tv}wr.prototype.isReactComponent={};wr.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};wr.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function iv(){}iv.prototype=wr.prototype;function lp(e,t,n){this.props=e,this.context=t,this.refs=nv,this.updater=n||tv}var cp=lp.prototype=new iv;cp.constructor=lp;ev(cp,wr.prototype);cp.isPureReactComponent=!0;var K_=Array.isArray;function rp(){}var Ce={H:null,A:null,T:null,S:null},sv=Object.prototype.hasOwnProperty;function up(e,t,n){var i=n.ref;return{$$typeof:op,type:e,key:t,ref:i!==void 0?i:null,props:n}}function PE(e,t){return up(e.type,t,e.props)}function hp(e){return typeof e=="object"&&e!==null&&e.$$typeof===op}function BE(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var Q_=/\/+/g;function ap(e,t){return typeof e=="object"&&e!==null&&e.key!=null?BE(""+e.key):t.toString(36)}function zE(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch(typeof e.status=="string"?e.then(rp,rp):(e.status="pending",e.then(function(t){e.status==="pending"&&(e.status="fulfilled",e.value=t)},function(t){e.status==="pending"&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}function Ar(e,t,n,i,s){var a=typeof e;(a==="undefined"||a==="boolean")&&(e=null);var r=!1;if(e===null)r=!0;else switch(a){case"bigint":case"string":case"number":r=!0;break;case"object":switch(e.$$typeof){case op:case EE:r=!0;break;case $_:return r=e._init,Ar(r(e._payload),t,n,i,s)}}if(r)return s=s(e),r=i===""?"."+ap(e,0):i,K_(s)?(n="",r!=null&&(n=r.replace(Q_,"$&/")+"/"),Ar(s,t,n,"",function(c){return c})):s!=null&&(hp(s)&&(s=PE(s,n+(s.key==null||e&&e.key===s.key?"":(""+s.key).replace(Q_,"$&/")+"/")+r)),t.push(s)),1;r=0;var o=i===""?".":i+":";if(K_(e))for(var l=0;l<e.length;l++)i=e[l],a=o+ap(i,l),r+=Ar(i,t,n,a,s);else if(l=IE(e),typeof l=="function")for(e=l.call(e),l=0;!(i=e.next()).done;)i=i.value,a=o+ap(i,l++),r+=Ar(i,t,n,a,s);else if(a==="object"){if(typeof e.then=="function")return Ar(zE(e),t,n,i,s);throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.")}return r}function lu(e,t,n){if(e==null)return e;var i=[],s=0;return Ar(e,i,"","",function(a){return t.call(n,a,s++)}),i}function FE(e){if(e._status===-1){var t=e._result,n=t();n.then(function(i){(e._status===0||e._status===-1)&&(e._status=1,e._result=i,n.status===void 0&&(n.status="fulfilled",n.value=i))},function(i){(e._status===0||e._status===-1)&&(e._status=2,e._result=i,n.status===void 0&&(n.status="rejected",n.reason=i))}),e._status===-1&&(e._status=0,e._result=n)}if(e._status===1)return e._result.default;throw e._result}var j_=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)};function av(e){var t=Ce.T,n={};n.types=t!==null?t.types:null,Ce.T=n;try{var i=e(),s=Ce.S;s!==null&&s(n,i),typeof i=="object"&&i!==null&&typeof i.then=="function"&&i.then(rp,j_)}catch(a){j_(a)}finally{t!==null&&n.types!==null&&(t.types=n.types),Ce.T=t}}function rv(e){var t=Ce.T;if(t!==null){var n=t.types;n===null?t.types=[e]:n.indexOf(e)===-1&&n.push(e)}else av(rv.bind(null,e))}var HE={map:lu,forEach:function(e,t,n){lu(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return lu(e,function(){t++}),t},toArray:function(e){return lu(e,function(t){return t})||[]},only:function(e){if(!hp(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};Pt.Activity=LE;Pt.Children=HE;Pt.Component=wr;Pt.Fragment=TE;Pt.Profiler=wE;Pt.PureComponent=lp;Pt.StrictMode=AE;Pt.Suspense=DE;Pt.ViewTransition=OE;Pt.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=Ce;Pt.__COMPILER_RUNTIME={__proto__:null,c:function(e){return Ce.H.useMemoCache(e)}};Pt.addTransitionType=rv;Pt.cache=function(e){return function(){return e.apply(null,arguments)}};Pt.cacheSignal=function(){return null};Pt.cloneElement=function(e,t,n){if(e==null)throw Error("The argument must be a React element, but you passed "+e+".");var i=ev({},e.props),s=e.key;if(t!=null)for(a in t.key!==void 0&&(s=""+t.key),t)!sv.call(t,a)||a==="key"||a==="__self"||a==="__source"||a==="ref"&&t.ref===void 0||(i[a]=t[a]);var a=arguments.length-2;if(a===1)i.children=n;else if(1<a){for(var r=Array(a),o=0;o<a;o++)r[o]=arguments[o+2];i.children=r}return up(e.type,s,i)};Pt.createContext=function(e){return e={$$typeof:RE,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:CE,_context:e},e};Pt.createElement=function(e,t,n){var i,s={},a=null;if(t!=null)for(i in t.key!==void 0&&(a=""+t.key),t)sv.call(t,i)&&i!=="key"&&i!=="__self"&&i!=="__source"&&(s[i]=t[i]);var r=arguments.length-2;if(r===1)s.children=n;else if(1<r){for(var o=Array(r),l=0;l<r;l++)o[l]=arguments[l+2];s.children=o}if(e&&e.defaultProps)for(i in r=e.defaultProps,r)s[i]===void 0&&(s[i]=r[i]);return up(e,a,s)};Pt.createRef=function(){return{current:null}};Pt.forwardRef=function(e){return{$$typeof:NE,render:e}};Pt.isValidElement=hp;Pt.lazy=function(e){return{$$typeof:$_,_payload:{_status:-1,_result:e},_init:FE}};Pt.memo=function(e,t){return{$$typeof:UE,type:e,compare:t===void 0?null:t}};Pt.startTransition=av;Pt.unstable_useCacheRefresh=function(){return Ce.H.useCacheRefresh()};Pt.use=function(e){return Ce.H.use(e)};Pt.useActionState=function(e,t,n){return Ce.H.useActionState(e,t,n)};Pt.useCallback=function(e,t){return Ce.H.useCallback(e,t)};Pt.useContext=function(e){return Ce.H.useContext(e)};Pt.useDebugValue=function(){};Pt.useDeferredValue=function(e,t){return Ce.H.useDeferredValue(e,t)};Pt.useEffect=function(e,t){return Ce.H.useEffect(e,t)};Pt.useEffectEvent=function(e){return Ce.H.useEffectEvent(e)};Pt.useId=function(){return Ce.H.useId()};Pt.useImperativeHandle=function(e,t,n){return Ce.H.useImperativeHandle(e,t,n)};Pt.useInsertionEffect=function(e,t){return Ce.H.useInsertionEffect(e,t)};Pt.useLayoutEffect=function(e,t){return Ce.H.useLayoutEffect(e,t)};Pt.useMemo=function(e,t){return Ce.H.useMemo(e,t)};Pt.useOptimistic=function(e,t){return Ce.H.useOptimistic(e,t)};Pt.useReducer=function(e,t,n){return Ce.H.useReducer(e,t,n)};Pt.useRef=function(e){return Ce.H.useRef(e)};Pt.useState=function(e){return Ce.H.useState(e)};Pt.useSyncExternalStore=function(e,t,n){return Ce.H.useSyncExternalStore(e,t,n)};Pt.useTransition=function(){return Ce.H.useTransition()};Pt.version="19.3.0"});var cu=Ws((AD,lv)=>{"use strict";lv.exports=ov()});var vv=Ws(Pe=>{"use strict";function mp(e,t){var n=e.length;e.push(t);t:for(;0<n;){var i=n-1>>>1,s=e[i];if(0<uu(s,t))e[i]=t,e[n]=s,n=i;else break t}}function Wi(e){return e.length===0?null:e[0]}function fu(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;t:for(var i=0,s=e.length,a=s>>>1;i<a;){var r=2*(i+1)-1,o=e[r],l=r+1,c=e[l];if(0>uu(o,n))l<s&&0>uu(c,o)?(e[i]=c,e[l]=n,i=l):(e[i]=o,e[r]=n,i=r);else if(l<s&&0>uu(c,n))e[i]=c,e[l]=n,i=l;else break t}}return t}function uu(e,t){var n=e.sortIndex-t.sortIndex;return n!==0?n:e.id-t.id}Pe.unstable_now=void 0;typeof performance=="object"&&typeof performance.now=="function"?(cv=performance,Pe.unstable_now=function(){return cv.now()}):(fp=Date,uv=fp.now(),Pe.unstable_now=function(){return fp.now()-uv});var cv,fp,uv,_s=[],qs=[],VE=1,pi=null,Tn=3,gp=!1,ll=!1,cl=!1,_p=!1,dv=typeof setTimeout=="function"?setTimeout:null,pv=typeof clearTimeout=="function"?clearTimeout:null,hv=typeof setImmediate<"u"?setImmediate:null;function hu(e){for(var t=Wi(qs);t!==null;){if(t.callback===null)fu(qs);else if(t.startTime<=e)fu(qs),t.sortIndex=t.expirationTime,mp(_s,t);else break;t=Wi(qs)}}function vp(e){if(cl=!1,hu(e),!ll)if(Wi(_s)!==null)ll=!0,Rr||(Rr=!0,Cr());else{var t=Wi(qs);t!==null&&yp(vp,t.startTime-e)}}var Rr=!1,ul=-1,mv=5,gv=-1;function _v(){return _p?!0:!(Pe.unstable_now()-gv<mv)}function dp(){if(_p=!1,Rr){var e=Pe.unstable_now();gv=e;var t=!0;try{t:{ll=!1,cl&&(cl=!1,pv(ul),ul=-1),gp=!0;var n=Tn;try{e:{for(hu(e),pi=Wi(_s);pi!==null&&!(pi.expirationTime>e&&_v());){var i=pi.callback;if(typeof i=="function"){pi.callback=null,Tn=pi.priorityLevel;var s=i(pi.expirationTime<=e);if(e=Pe.unstable_now(),typeof s=="function"){pi.callback=s,hu(e),t=!0;break e}pi===Wi(_s)&&fu(_s),hu(e)}else fu(_s);pi=Wi(_s)}if(pi!==null)t=!0;else{var a=Wi(qs);a!==null&&yp(vp,a.startTime-e),t=!1}}break t}finally{pi=null,Tn=n,gp=!1}t=void 0}}finally{t?Cr():Rr=!1}}}var Cr;typeof hv=="function"?Cr=function(){hv(dp)}:typeof MessageChannel<"u"?(pp=new MessageChannel,fv=pp.port2,pp.port1.onmessage=dp,Cr=function(){fv.postMessage(null)}):Cr=function(){dv(dp,0)};var pp,fv;function yp(e,t){ul=dv(function(){e(Pe.unstable_now())},t)}Pe.unstable_IdlePriority=5;Pe.unstable_ImmediatePriority=1;Pe.unstable_LowPriority=4;Pe.unstable_NormalPriority=3;Pe.unstable_Profiling=null;Pe.unstable_UserBlockingPriority=2;Pe.unstable_cancelCallback=function(e){e.callback=null};Pe.unstable_forceFrameRate=function(e){0>e||125<e?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):mv=0<e?Math.floor(1e3/e):5};Pe.unstable_getCurrentPriorityLevel=function(){return Tn};Pe.unstable_next=function(e){switch(Tn){case 1:case 2:case 3:var t=3;break;default:t=Tn}var n=Tn;Tn=t;try{return e()}finally{Tn=n}};Pe.unstable_requestPaint=function(){_p=!0};Pe.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=Tn;Tn=e;try{return t()}finally{Tn=n}};Pe.unstable_scheduleCallback=function(e,t,n){var i=Pe.unstable_now();switch(typeof n=="object"&&n!==null?(n=n.delay,n=typeof n=="number"&&0<n?i+n:i):n=i,e){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=n+s,e={id:VE++,callback:t,priorityLevel:e,startTime:n,expirationTime:s,sortIndex:-1},n>i?(e.sortIndex=n,mp(qs,e),Wi(_s)===null&&e===Wi(qs)&&(cl?(pv(ul),ul=-1):cl=!0,yp(vp,n-i))):(e.sortIndex=s,mp(_s,e),ll||gp||(ll=!0,Rr||(Rr=!0,Cr()))),e};Pe.unstable_shouldYield=_v;Pe.unstable_wrapCallback=function(e){var t=Tn;return function(){var n=Tn;Tn=t;try{return e.apply(this,arguments)}finally{Tn=n}}}});var xv=Ws((CD,yv)=>{"use strict";yv.exports=vv()});var bv=Ws(An=>{"use strict";var GE=cu();function Mv(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Ys(){}var Un={d:{f:Ys,r:function(){throw Error(Mv(522))},D:Ys,C:Ys,L:Ys,m:Ys,X:Ys,S:Ys,M:Ys},p:0,findDOMNode:null},kE=Symbol.for("react.portal"),XE=Symbol.for("react.recoverable"),Sv=Symbol.for("react.optimistic_key");function WE(e,t,n){var i=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:kE,key:i==null?null:i===Sv?Sv:""+i,children:e,containerInfo:t,implementation:n}}var hl=GE.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function du(e,t){if(e==="font")return"";if(typeof t=="string")return t==="use-credentials"?t:""}An.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=Un;An.browser=function(e){return{$$typeof:XE,_reason:e}};An.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(Mv(299));return WE(e,t,null,n)};An.flushSync=function(e){var t=hl.T,n=Un.p;try{if(hl.T=null,Un.p=2,e)return e()}finally{hl.T=t,Un.p=n,Un.d.f()}};An.preconnect=function(e,t){typeof e=="string"&&(t?(t=t.crossOrigin,t=typeof t=="string"?t==="use-credentials"?t:"":void 0):t=null,Un.d.C(e,t))};An.prefetchDNS=function(e){typeof e=="string"&&Un.d.D(e)};An.preinit=function(e,t){if(typeof e=="string"&&t&&typeof t.as=="string"){var n=t.as,i=du(n,t.crossOrigin),s=typeof t.integrity=="string"?t.integrity:void 0,a=typeof t.fetchPriority=="string"?t.fetchPriority:void 0;n==="style"?Un.d.S(e,typeof t.precedence=="string"?t.precedence:void 0,{crossOrigin:i,integrity:s,fetchPriority:a}):n==="script"&&Un.d.X(e,{crossOrigin:i,integrity:s,fetchPriority:a,nonce:typeof t.nonce=="string"?t.nonce:void 0})}};An.preinitModule=function(e,t){if(typeof e=="string")if(typeof t=="object"&&t!==null){if(t.as==null||t.as==="script"){var n=du(t.as,t.crossOrigin);Un.d.M(e,{crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0})}}else t==null&&Un.d.M(e)};An.preload=function(e,t){if(typeof e=="string"&&typeof t=="object"&&t!==null&&typeof t.as=="string"){var n=t.as,i=du(n,t.crossOrigin);Un.d.L(e,n,{crossOrigin:i,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,type:typeof t.type=="string"?t.type:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy=="string"?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet=="string"?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes=="string"?t.imageSizes:void 0,media:typeof t.media=="string"?t.media:void 0})}};An.preloadModule=function(e,t){if(typeof e=="string")if(t){var n=du(t.as,t.crossOrigin);Un.d.m(e,{as:typeof t.as=="string"&&t.as!=="script"?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0})}else Un.d.m(e)};An.requestFormReset=function(e){Un.d.r(e)};An.unstable_batchedUpdates=function(e,t){return e(t)};An.useFormState=function(e,t,n){return hl.H.useFormState(e,t,n)};An.useFormStatus=function(){return hl.H.useHostTransitionStatus()};An.version="19.3.0"});var Av=Ws((ND,Tv)=>{"use strict";function Ev(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(Ev)}catch(e){console.error(e)}}Ev(),Tv.exports=bv()});var fb=Ws(Zh=>{"use strict";var tn=xv(),hx=cu(),qE=Av();function Q(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function fx(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function jl(e){for(var t=e,n=t;n&&!n.alternate;)t=n,(t.flags&4098)!==0&&(e=t.return),n=t.return;for(;t.return;)t=t.return;return t.tag===3?e:null}function dx(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function px(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function wv(e){if(jl(e)!==e)throw Error(Q(188))}function YE(e){var t=e.alternate;if(!t){if(t=jl(e),t===null)throw Error(Q(188));return t!==e?null:e}for(var n=e,i=t;;){var s=n.return;if(s===null)break;var a=s.alternate;if(a===null){if(i=s.return,i!==null){n=i;continue}break}if(s.child===a.child){for(a=s.child;a;){if(a===n)return wv(s),e;if(a===i)return wv(s),t;a=a.sibling}throw Error(Q(188))}if(n.return!==i.return)n=s,i=a;else{for(var r=!1,o=s.child;o;){if(o===n){r=!0,n=s,i=a;break}if(o===i){r=!0,i=s,n=a;break}o=o.sibling}if(!r){for(o=a.child;o;){if(o===n){r=!0,n=a,i=s;break}if(o===i){r=!0,i=a,n=s;break}o=o.sibling}if(!r)throw Error(Q(189))}}if(n.alternate!==i)throw Error(Q(190))}if(n.tag!==3)throw Error(Q(188));return n.stateNode.current===n?e:t}function mx(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=mx(e),t!==null)return t;e=e.sibling}return null}function Wn(e,t,n,i,s,a){for(;e!==null;){if((e.tag===5||e.tag===27||e.tag===6)&&n(e,i,s,a)||(e.tag!==22||e.memoizedState===null)&&(t||e.tag!==5&&e.tag!==27)&&Wn(e.child,t,n,i,s,a))return!0;e=e.sibling}return!1}function rr(e){for(e=e.return;e!==null;){if(e.tag===3||e.tag===5||e.tag===27)return e;e=e.return}return null}function Cv(e){var t=!1;for(e=e.return;e!==null&&(e.tag===4&&(t=!0),!(e.tag===3||e.tag===5||e.tag===27));)e=e.return;return t}function gx(e){var t=[null,null],n=rr(e);return n===null||_x(t,e,n.child,{foundSelf:!1}),t}function _x(e,t,n,i){for(;n!==null;){if(n===t)i.foundSelf=!0;else if(n.tag===5||n.tag===27||n.tag===6){if(i.foundSelf)return e[1]=n,!0;e[0]=n}else if((n.tag!==22||n.memoizedState===null)&&_x(e,t,n.child,i))return!0;n=n.sibling}return!1}function $e(e){switch(e.tag){case 5:case 27:case 6:return e.stateNode;case 3:return e.stateNode.containerInfo;default:throw Error(Q(559))}}var Pr=null,Qp=null;function ZE(e,t,n){return e===n?!0:e===t?(Pr=e,!0):!1}function JE(e,t,n){return e===n?(Qp=e,!1):e===t?(Qp!==null&&(Pr=e),!0):!1}function Rv(e){if(e===null)return null;do e=e===null?null:e.return;while(e&&e.tag!==5&&e.tag!==27&&e.tag!==3);return e||null}function jp(e,t,n){for(var i=0,s=e;s;s=n(s))i++;s=0;for(var a=t;a;a=n(a))s++;for(;0<i-s;)e=n(e),i--;for(;0<s-i;)t=n(t),s--;for(;i--;){if(e===t||t!==null&&e===t.alternate)return e;e=n(e),t=n(t)}return null}var Ee=Object.assign,KE=Symbol.for("react.element"),pu=Symbol.for("react.transitional.element"),vl=Symbol.for("react.portal"),Br=Symbol.for("react.fragment"),vx=Symbol.for("react.strict_mode"),$p=Symbol.for("react.profiler"),yx=Symbol.for("react.consumer"),Qi=Symbol.for("react.context"),lg=Symbol.for("react.forward_ref"),tm=Symbol.for("react.suspense"),em=Symbol.for("react.suspense_list"),cg=Symbol.for("react.memo"),Qs=Symbol.for("react.lazy"),nm=Symbol.for("react.activity"),QE=Symbol.for("react.legacy_hidden"),jE=Symbol.for("react.memo_cache_sentinel"),im=Symbol.for("react.view_transition"),$E=Symbol.for("react.recoverable"),Nv=Symbol.iterator;function fl(e){return e===null||typeof e!="object"?null:(e=Nv&&e[Nv]||e["@@iterator"],typeof e=="function"?e:null)}var tT=Symbol.for("react.client.reference");function sm(e){if(e==null)return null;if(typeof e=="function")return e.$$typeof===tT?null:e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Br:return"Fragment";case $p:return"Profiler";case vx:return"StrictMode";case tm:return"Suspense";case em:return"SuspenseList";case nm:return"Activity";case im:return"ViewTransition"}if(typeof e=="object")switch(e.$$typeof){case vl:return"Portal";case Qi:return e.displayName||"Context";case yx:return(e._context.displayName||"Context")+".Consumer";case lg:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case cg:return t=e.displayName||null,t!==null?t:sm(e.type)||"Memo";case Qs:t=e._payload,e=e._init;try{return sm(e(t))}catch{}}return null}var yl=Array.isArray,Lt=hx.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,ce=qE.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,Ya={pending:!1,data:null,method:null,action:null},am=[],zr=-1;function ss(e){return{current:e}}function gn(e){0>zr||(e.current=am[zr],am[zr]=null,zr--)}function De(e,t){zr++,am[zr]=e.current,e.current=t}var es=ss(null),Pl=ss(null),ra=ss(null),th=ss(null);function eh(e,t){switch(De(ra,t),De(Pl,e),De(es,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?Xy(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=Xy(t),e=VM(t,e);else switch(e){case"svg":e=1;break;case"math":e=2;break;default:e=0}}gn(es),De(es,e)}function so(){gn(es),gn(Pl),gn(ra)}function rm(e){var t=e.memoizedState;t!==null&&(mo._currentValue=t.memoizedState,De(th,e)),t=es.current;var n=VM(t,e.type);t!==n&&(De(Pl,e),De(es,n))}function nh(e){Pl.current===e&&(gn(es),gn(Pl)),th.current===e&&(gn(th),mo._currentValue=Ya)}var xp,Dv;function Js(e){if(xp===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);xp=t&&t[1]||"",Dv=-1<n.stack.indexOf(`
    at`)?" (<anonymous>)":-1<n.stack.indexOf("@")?"@unknown:0:0":""}return`
`+xp+e+Dv}var Sp=!1;function Mp(e,t){if(!e||Sp)return"";Sp=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var i={DetermineComponentFrameRoot:function(){try{if(t){var p=function(){throw Error()};if(Object.defineProperty(p.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(p,[])}catch(v){var u=v}Reflect.construct(e,[],p)}else{try{p.call()}catch(v){u=v}p=!1;try{var d=Object.getOwnPropertyDescriptor(e.prototype,"props");Object.defineProperty(e.prototype,"props",{configurable:!0,set:function(){throw Error()}}),p=!0,new e}finally{p&&(d!==void 0?Object.defineProperty(e.prototype,"props",d):delete e.prototype.props)}}}else{try{throw Error()}catch(v){u=v}(p=e())&&typeof p.catch=="function"&&p.catch(function(){})}}catch(v){if(v&&u&&typeof v.stack=="string")return[v.stack,u.stack]}return[null,null]}};i.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var s=Object.getOwnPropertyDescriptor(i.DetermineComponentFrameRoot,"name");s&&s.configurable&&Object.defineProperty(i.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var a=i.DetermineComponentFrameRoot(),r=a[0],o=a[1];if(r&&o){var l=r.split(`
`),c=o.split(`
`);for(s=i=0;i<l.length&&!l[i].includes("DetermineComponentFrameRoot");)i++;for(;s<c.length&&!c[s].includes("DetermineComponentFrameRoot");)s++;if(i===l.length||s===c.length)for(i=l.length-1,s=c.length-1;1<=i&&0<=s&&l[i]!==c[s];)s--;for(;1<=i&&0<=s;i--,s--)if(l[i]!==c[s]){if(i!==1||s!==1)do if(i--,s--,0>s||l[i]!==c[s]){var f=`
`+l[i].replace(" at new "," at ");return e.displayName&&f.includes("<anonymous>")&&(f=f.replace("<anonymous>",e.displayName)),f}while(1<=i&&0<=s);break}}}finally{Sp=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:"")?Js(n):""}function eT(e,t){switch(e.tag){case 26:case 27:case 5:return Js(e.type);case 16:return Js("Lazy");case 13:return e.child!==t&&t!==null?Js("Suspense Fallback"):Js("Suspense");case 19:return Js("SuspenseList");case 0:case 15:return Mp(e.type,!1);case 11:return Mp(e.type.render,!1);case 1:return Mp(e.type,!0);case 31:return Js("Activity");case 30:return Js("ViewTransition");default:return""}}function Uv(e){try{var t="",n=null;do t+=eT(e,n),n=e,e=e.return;while(e);return t}catch(i){return`
Error generating stack: `+i.message+`
`+i.stack}}var om=Object.prototype.hasOwnProperty,ug=tn.unstable_scheduleCallback,bp=tn.unstable_cancelCallback,nT=tn.unstable_shouldYield,iT=tn.unstable_requestPaint,ei=tn.unstable_now,sT=tn.unstable_getCurrentPriorityLevel,xx=tn.unstable_ImmediatePriority,Sx=tn.unstable_UserBlockingPriority,ih=tn.unstable_NormalPriority,aT=tn.unstable_LowPriority,Mx=tn.unstable_IdlePriority,rT=tn.log,oT=tn.unstable_setDisableYieldValue,$l=null,ni=null;function ta(e){if(typeof rT=="function"&&oT(e),ni&&typeof ni.setStrictMode=="function")try{ni.setStrictMode($l,e)}catch{}}var ii=Math.clz32?Math.clz32:uT,lT=Math.log,cT=Math.LN2;function uT(e){return e>>>=0,e===0?32:31-(lT(e)/cT|0)|0}var mu=256,gu=262144,_u=4194304;function Ga(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&-e;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function Rh(e,t,n){var i=e.pendingLanes;if(i===0)return 0;var s=0,a=e.suspendedLanes,r=e.pingedLanes;e=e.warmLanes;var o=i&134217727;return o!==0?(i=o&~a,i!==0?s=Ga(i):(r&=o,r!==0?s=Ga(r):n||(n=o&~e,n!==0&&(s=Ga(n))))):(o=i&~a,o!==0?s=Ga(o):r!==0?s=Ga(r):n||(n=i&~e,n!==0&&(s=Ga(n)))),s===0?0:t!==0&&t!==s&&(t&a)===0&&(a=s&-s,n=t&-t,a>=n||a===32&&(n&4194048)!==0)?t:s}function tc(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function bx(e,t){(t&8)!==0&&(t|=t&32);var n=e.entangledLanes;if(n!==0)for(e=e.entanglements,n&=t;0<n;){var i=31-ii(n),s=1<<i;t|=e[i],n&=~s}return t}function hT(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Ex(){var e=_u;return _u<<=1,(_u&62914560)===0&&(_u=4194304),e}function Ep(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function ec(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function fT(e,t,n,i,s,a){var r=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var o=e.entanglements,l=e.expirationTimes,c=e.hiddenUpdates;for(n=r&~n;0<n;){var f=31-ii(n),p=1<<f;o[f]=0,l[f]=-1;var u=c[f];if(u!==null)for(c[f]=null,f=0;f<u.length;f++){var d=u[f];d!==null&&(d.lane&=-536870913)}n&=~p}i!==0&&Tx(e,i,0),a!==0&&s===0&&e.tag!==0&&(e.suspendedLanes|=a&~(r&~t))}function Tx(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var i=31-ii(t);e.entangledLanes|=t,e.entanglements[i]=e.entanglements[i]|1073741824|n&261930}function Ax(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var i=31-ii(n),s=1<<i;s&t|e[i]&t&&(e[i]|=t),n&=~s}}function wx(e,t){var n=t&-t;return n=(n&42)!==0?1:hg(n),(n&(e.suspendedLanes|t))!==0?0:n}function hg(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function fg(e){return e&=-e,2<e?8<e?(e&134217727)!==0?32:268435456:8:2}function Cx(){var e=ce.p;return e!==0?e:(e=window.event,e===void 0?32:cb(e.type))}function Lv(e,t){var n=ce.p;try{return ce.p=e,t()}finally{ce.p=n}}var Ns=Math.random().toString(36).slice(2),pn="__reactFiber$"+Ns,qn="__reactProps$"+Ns,vo="__reactContainer$"+Ns,Ov="__reactEvents$"+Ns,dT="__reactListeners$"+Ns,pT="__reactHandles$"+Ns,Iv="__reactResources$"+Ns,nc="__reactMarker$"+Ns,sh="__reactLoad$"+Ns;function Nh(e){delete e[pn],delete e[qn],delete e[dT],delete e[pT]}function Wa(e){var t;if(t=e[pn])return t;for(var n=e.parentNode;n;){if(t=n[vo]||n[pn]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=jy(e);e!==null;){if(n=e[pn])return n;e=jy(e)}return t}e=n,n=e.parentNode}return null}function yo(e){if(e=e[pn]||e[vo]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function xl(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(Q(33))}function Zr(e){var t=e[Iv];return t||(t=e[Iv]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function ln(e){e[nc]=!0}function Rx(e){e[sh]=void 0}var Nx=new Set,Dx={};function or(e,t){ao(e,t),ao(e+"Capture",t)}function ao(e,t){for(Dx[e]=t,e=0;e<t.length;e++)Nx.add(t[e])}var mT=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),Pv={},Bv={};function gT(e){return om.call(Bv,e)?!0:om.call(Pv,e)?!1:mT.test(e)?Bv[e]=!0:(Pv[e]=!0,!1)}var re=!1;function zv(){var e=re;return re=!1,e}function Iu(e,t,n){if(gT(t))if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":e.removeAttribute(t);return;case"boolean":var i=t.toLowerCase().slice(0,5);if(i!=="data-"&&i!=="aria-"){e.removeAttribute(t);return}}e.setAttribute(t,n)}}function vu(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(t);return}e.setAttribute(t,n)}}function vs(e,t,n,i){if(i===null)e.removeAttribute(n);else{switch(typeof i){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(n);return}e.setAttributeNS(t,n,i)}}function Qn(e){switch(typeof e){case"bigint":case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function Ux(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function _T(e,t,n){var i=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&typeof i<"u"&&typeof i.get=="function"&&typeof i.set=="function"){var s=i.get,a=i.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return s.call(this)},set:function(r){n=""+r,a.call(this,r)}}),Object.defineProperty(e,t,{enumerable:i.enumerable}),{getValue:function(){return n},setValue:function(r){n=""+r},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function lm(e){if(!e._valueTracker){var t=Ux(e)?"checked":"value";e._valueTracker=_T(e,t,""+e[t])}}function Lx(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),i="";return e&&(i=Ux(e)?e.checked?"true":"false":e.value),e=i,e!==n?(t.setValue(e),!0):!1}var vT=/[\n"\\]/g;function yi(e){return e.replace(vT,function(t){return"\\"+t.charCodeAt(0).toString(16)+" "})}function cm(e,t,n,i,s,a,r,o){e.name="",r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"?e.type=r:e.removeAttribute("type"),t!=null?r==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+Qn(t)):e.value!==""+Qn(t)&&(e.value=""+Qn(t)):r!=="submit"&&r!=="reset"||e.removeAttribute("value"),t!=null?r==="number"&&e.value==t?Tp(e,Qn(e.value)):Tp(e,Qn(t)):n!=null?Tp(e,Qn(n)):i!=null&&e.removeAttribute("value"),s==null&&a!=null&&(e.defaultChecked=!!a),s!=null&&(e.checked=s&&typeof s!="function"&&typeof s!="symbol"),o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"?e.name=""+Qn(o):e.removeAttribute("name")}function Ox(e,t,n,i,s,a,r,o){if(a!=null&&typeof a!="function"&&typeof a!="symbol"&&typeof a!="boolean"&&(e.type=a),t!=null||n!=null){if(!(a!=="submit"&&a!=="reset"||t!=null)){lm(e);return}n=n!=null?""+Qn(n):"",t=t!=null?""+Qn(t):n,o||t===e.value||(e.value=t),e.defaultValue=t}i=i??s,i=typeof i!="function"&&typeof i!="symbol"&&!!i,e.checked=o?e.checked:!!i,e.defaultChecked=!!i,r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"&&(e.name=r),lm(e)}function Tp(e,t){e.defaultValue!==""+t&&(e.defaultValue=""+t)}function Jr(e,t,n,i){if(e=e.options,t){t={};for(var s=0;s<n.length;s++)t["$"+n[s]]=!0;for(n=0;n<e.length;n++)s=t.hasOwnProperty("$"+e[n].value),e[n].selected!==s&&(e[n].selected=s),s&&i&&(e[n].defaultSelected=!0)}else{for(n=""+Qn(n),t=null,s=0;s<e.length;s++){if(e[s].value===n){e[s].selected=!0,i&&(e[s].defaultSelected=!0);return}t!==null||e[s].disabled||(t=e[s])}t!==null&&(t.selected=!0)}}function Ix(e,t,n){if(t!=null&&(t=""+Qn(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n!=null?""+Qn(n):""}function Px(e,t,n,i){if(t==null){if(i!=null){if(n!=null)throw Error(Q(92));if(yl(i)){if(1<i.length)throw Error(Q(93));i=i[0]}n=i}n==null&&(n=""),t=n}n=Qn(t),e.defaultValue=n,i=e.textContent,i===n&&i!==""&&i!==null&&(e.value=i),lm(e)}function ro(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var yT=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function Fv(e,t,n){var i=t.indexOf("--")===0;n==null||typeof n=="boolean"||n===""?i?e.setProperty(t,""):t==="float"?e.cssFloat="":e[t]="":i?e.setProperty(t,n):typeof n!="number"||n===0||yT.has(t)?t==="float"?e.cssFloat=n:e[t]=(""+n).trim():e[t]=n+"px"}function Bx(e,t,n){if(t!=null&&typeof t!="object")throw Error(Q(62));if(e=e.style,n!=null){for(var i in n)!n.hasOwnProperty(i)||t!=null&&t.hasOwnProperty(i)||(i.indexOf("--")===0?e.setProperty(i,""):i==="float"?e.cssFloat="":e[i]="",re=!0);for(var s in t)i=t[s],t.hasOwnProperty(s)&&n[s]!==i&&(Fv(e,s,i),re=!0)}else for(var a in t)t.hasOwnProperty(a)&&Fv(e,a,t[a])}function dg(e){if(e.indexOf("-")===-1)return!1;switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var xT=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["maskType","mask-type"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),ST=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function Pu(e){return ST.test(""+e)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":e}function ji(){}var um=null;function pg(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Fr=null,Kr=null;function Hv(e){var t=yo(e);if(t&&(e=t.stateNode)){var n=e[qn]||null;t:switch(e=t.stateNode,t.type){case"input":if(cm(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll('input[name="'+yi(""+t)+'"][type="radio"]'),t=0;t<n.length;t++){var i=n[t];if(i!==e&&i.form===e.form){var s=i[qn]||null;if(!s)throw Error(Q(90));cm(i,s.value,s.defaultValue,s.defaultValue,s.checked,s.defaultChecked,s.type,s.name)}}for(t=0;t<n.length;t++)i=n[t],i.form===e.form&&Lx(i)}break t;case"textarea":Ix(e,n.value,n.defaultValue);break t;case"select":t=n.value,t!=null&&Jr(e,!!n.multiple,t,!1)}}}var Ap=!1;function zx(e,t,n){if(Ap)return e(t,n);Ap=!0;try{var i=e(t);return i}finally{if(Ap=!1,(Fr!==null||Kr!==null)&&(Xh(),Fr&&(t=Fr,e=Kr,Kr=Fr=null,Hv(t),e)))for(t=0;t<e.length;t++)Hv(e[t])}}function Bl(e,t){var n=e.stateNode;if(n===null)return null;var i=n[qn]||null;if(i===null)return null;n=i[t];t:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(i=!i.disabled)||(e=e.type,i=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!i;break t;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(Q(231,t,typeof n));return n}var Es=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),hm=!1;if(Es)try{Nr={},Object.defineProperty(Nr,"passive",{get:function(){hm=!0}}),window.addEventListener("test",Nr,Nr),window.removeEventListener("test",Nr,Nr)}catch{hm=!1}var Nr,ea=null,mg=null,Bu=null;function Fx(){if(Bu)return Bu;var e,t=mg,n=t.length,i,s="value"in ea?ea.value:ea.textContent,a=s.length;for(e=0;e<n&&t[e]===s[e];e++);var r=n-e;for(i=1;i<=r&&t[n-i]===s[a-i];i++);return Bu=s.slice(e,1<i?1-i:void 0)}function zu(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function yu(){return!0}function Vv(){return!1}function Pn(e){function t(n,i,s,a,r){this._reactName=n,this._targetInst=s,this.type=i,this.nativeEvent=a,this.target=r,this.currentTarget=null;for(var o in e)e.hasOwnProperty(o)&&(n=e[o],this[o]=n?n(a):a[o]);return this.isDefaultPrevented=(a.defaultPrevented!=null?a.defaultPrevented:a.returnValue===!1)?yu:Vv,this.isPropagationStopped=Vv,this}return Ee(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=yu)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=yu)},persist:function(){},isPersistent:yu}),t}var Sa={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Dh=Pn(Sa),ic=Ee({},Sa,{view:0,detail:0}),MT=Pn(ic),wp,Cp,dl,Uh=Ee({},ic,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:gg,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==dl&&(dl&&e.type==="mousemove"?(wp=e.screenX-dl.screenX,Cp=e.screenY-dl.screenY):Cp=wp=0,dl=e),wp)},movementY:function(e){return"movementY"in e?e.movementY:Cp}}),Gv=Pn(Uh),bT=Ee({},Uh,{dataTransfer:0}),ET=Pn(bT),TT=Ee({},ic,{relatedTarget:0}),Rp=Pn(TT),AT=Ee({},Sa,{animationName:0,elapsedTime:0,pseudoElement:0}),wT=Pn(AT),CT=Ee({},Sa,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),RT=Pn(CT),NT=Ee({},Sa,{data:0}),kv=Pn(NT),DT={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},UT={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},LT={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function OT(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=LT[e])?!!t[e]:!1}function gg(){return OT}var IT=Ee({},ic,{key:function(e){if(e.key){var t=DT[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=zu(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?UT[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:gg,charCode:function(e){return e.type==="keypress"?zu(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?zu(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),PT=Pn(IT),BT=Ee({},Uh,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),Xv=Pn(BT),zT=Ee({},Sa,{submitter:0}),FT=Pn(zT),HT=Ee({},ic,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:gg}),VT=Pn(HT),GT=Ee({},Sa,{propertyName:0,elapsedTime:0,pseudoElement:0}),kT=Pn(GT),XT=Ee({},Uh,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),WT=Pn(XT),qT=Ee({},Sa,{newState:0,oldState:0,source:0}),YT=Pn(qT),ZT=[9,13,27,32],_g=Es&&"CompositionEvent"in window,bl=null;Es&&"documentMode"in document&&(bl=document.documentMode);var JT=Es&&"TextEvent"in window&&!bl,Hx=Es&&(!_g||bl&&8<bl&&11>=bl),Wv=" ",qv=!1;function Vx(e,t){switch(e){case"keyup":return ZT.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Gx(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Hr=!1;function KT(e,t){switch(e){case"compositionend":return Gx(t);case"keypress":return t.which!==32?null:(qv=!0,Wv);case"textInput":return e=t.data,e===Wv&&qv?null:e;default:return null}}function QT(e,t){if(Hr)return e==="compositionend"||!_g&&Vx(e,t)?(e=Fx(),Bu=mg=ea=null,Hr=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return Hx&&t.locale!=="ko"?null:t.data;default:return null}}var jT={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Yv(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!jT[e.type]:t==="textarea"}function kx(e,t,n,i){Fr?Kr?Kr.push(i):Kr=[i]:Fr=i,t=Ah(t,"onChange"),0<t.length&&(n=new Dh("onChange","change",null,n,i),e.push({event:n,listeners:t}))}var El=null,zl=null;function $T(e){zM(e,0)}function Lh(e){var t=xl(e);if(Lx(t))return e}function Zv(e,t){if(e==="change")return t}var Xx=!1;Es&&(Es?(Su="oninput"in document,Su||(Np=document.createElement("div"),Np.setAttribute("oninput","return;"),Su=typeof Np.oninput=="function"),xu=Su):xu=!1,Xx=xu&&(!document.documentMode||9<document.documentMode));var xu,Su,Np;function Jv(){El&&(El.detachEvent("onpropertychange",Wx),zl=El=null)}function Wx(e){if(e.propertyName==="value"&&Lh(zl)){var t=[];kx(t,zl,e,pg(e)),zx($T,t)}}function tA(e,t,n){e==="focusin"?(Jv(),El=t,zl=n,El.attachEvent("onpropertychange",Wx)):e==="focusout"&&Jv()}function eA(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Lh(zl)}function nA(e,t){if(e==="click")return Lh(t)}function iA(e,t){if(e==="input"||e==="change")return Lh(t)}function sA(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var ai=typeof Object.is=="function"?Object.is:sA;function Fl(e,t){if(ai(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),i=Object.keys(t);if(n.length!==i.length)return!1;for(i=0;i<n.length;i++){var s=n[i];if(!om.call(t,s)||!ai(e[s],t[s]))return!1}return!0}function fm(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Kv(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Qv(e,t){var n=Kv(e);e=0;for(var i;n;){if(n.nodeType===3){if(i=e+n.textContent.length,e<=t&&i>=t)return{node:n,offset:t-e};e=i}t:{for(;n;){if(n.nextSibling){n=n.nextSibling;break t}n=n.parentNode}n=void 0}n=Kv(n)}}function qx(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?qx(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Yx(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=fm(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=fm(e.document)}return t}function vg(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}var aA=Es&&"documentMode"in document&&11>=document.documentMode,Vr=null,dm=null,Tl=null,pm=!1;function jv(e,t,n){var i=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;pm||Vr==null||Vr!==fm(i)||(i=Vr,"selectionStart"in i&&vg(i)?i={start:i.selectionStart,end:i.selectionEnd}:(i=(i.ownerDocument&&i.ownerDocument.defaultView||window).getSelection(),i={anchorNode:i.anchorNode,anchorOffset:i.anchorOffset,focusNode:i.focusNode,focusOffset:i.focusOffset}),Tl&&Fl(Tl,i)||(Tl=i,i=Ah(dm,"onSelect"),0<i.length&&(t=new Dh("onSelect","select",null,t,n),e.push({event:t,listeners:i}),t.target=Vr)))}function Ha(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var Gr={animationend:Ha("Animation","AnimationEnd"),animationiteration:Ha("Animation","AnimationIteration"),animationstart:Ha("Animation","AnimationStart"),transitionrun:Ha("Transition","TransitionRun"),transitionstart:Ha("Transition","TransitionStart"),transitioncancel:Ha("Transition","TransitionCancel"),transitionend:Ha("Transition","TransitionEnd")},Dp={},Zx={};Es&&(Zx=document.createElement("div").style,"AnimationEvent"in window||(delete Gr.animationend.animation,delete Gr.animationiteration.animation,delete Gr.animationstart.animation),"TransitionEvent"in window||delete Gr.transitionend.transition);function lr(e){if(Dp[e])return Dp[e];if(!Gr[e])return e;var t=Gr[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Zx)return Dp[e]=t[n];return e}var Jx=lr("animationend"),Kx=lr("animationiteration"),Qx=lr("animationstart"),rA=lr("transitionrun"),oA=lr("transitionstart"),lA=lr("transitioncancel"),jx=lr("transitionend"),$x=new Map,mm="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");mm.push("scrollEnd");function Ui(e,t){$x.set(e,t),or(t,[e])}var cA=0;function Ts(e,t){if(e.name!=null&&e.name!=="auto")return e.name;if(t.autoName!==null)return t.autoName;e=Di.identifierPrefix;var n=cA++;return e="_"+e+"t_"+n.toString(32)+"_",t.autoName=e}function $v(e){if(e==null||typeof e=="string")return e;var t=null,n=io;if(n!==null)for(var i=0;i<n.length;i++){var s=e[n[i]];if(s!=null){if(s==="none")return"none";t=t==null?s:t+(" "+s)}}return t??e.default}function Ds(e,t){return e=$v(e),t=$v(t),t==null?e==="auto"?null:e:t==="auto"?null:t}var ah=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},gi=[],kr=0,yg=0;function Oh(){for(var e=kr,t=yg=kr=0;t<e;){var n=gi[t];gi[t++]=null;var i=gi[t];gi[t++]=null;var s=gi[t];gi[t++]=null;var a=gi[t];if(gi[t++]=null,i!==null&&s!==null){var r=i.pending;r===null?s.next=s:(s.next=r.next,r.next=s),i.pending=s}a!==0&&tS(n,s,a)}}function Ih(e,t,n,i){gi[kr++]=e,gi[kr++]=t,gi[kr++]=n,gi[kr++]=i,yg|=i,e.lanes|=i,e=e.alternate,e!==null&&(e.lanes|=i)}function xg(e,t,n,i){return Ih(e,t,n,i),rh(e)}function cr(e,t){return Ih(e,null,null,t),rh(e)}function tS(e,t,n){e.lanes|=n;var i=e.alternate;i!==null&&(i.lanes|=n);for(var s=!1,a=e.return;a!==null;)a.childLanes|=n,i=a.alternate,i!==null&&(i.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(s=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,s&&t!==null&&(s=31-ii(n),e=a.hiddenUpdates,i=e[s],i===null?e[s]=[t]:i.push(t),t.lane=n|536870912),a):null}function rh(e){if(50<Il)throw Il=0,Zu=null,Error(Q(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var Xr={};function uA(e,t,n,i){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=i,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function kn(e,t,n,i){return new uA(e,t,n,i)}function Sg(e){return e=e.prototype,!(!e||!e.isReactComponent)}function Ms(e,t){var n=e.alternate;return n===null?(n=kn(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&1206910976,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function eS(e,t){e.flags&=1206910978;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Fu(e,t,n,i,s,a){var r=0;if(i=e,typeof i=="function")Sg(i)&&(r=1);else if(typeof i=="string")r=Pw(e,n,es.current)?26:e==="html"||e==="head"||e==="body"?27:5;else t:switch(i){case nm:return e=kn(31,n,t,s),e.elementType=nm,e.lanes=a,e;case Br:return Za(n.children,s,a,t);case vx:r=8,s|=24;break;case $p:return e=kn(12,n,t,s|2),e.elementType=$p,e.lanes=a,e;case tm:return e=kn(13,n,t,s),e.elementType=tm,e.lanes=a,e;case em:return e=kn(19,n,t,s),e.elementType=em,e.lanes=a,e;case QE:case im:return e=s|32,e=kn(30,n,t,e),e.elementType=im,e.lanes=a,e.stateNode={autoName:null,paired:null,clones:null,ref:null},e;default:if(typeof i=="object"&&i!==null)switch(i.$$typeof){case Qi:r=10;break t;case yx:r=9;break t;case lg:r=11;break t;case cg:r=14;break t;case Qs:r=16,i=null;break t}r=29,n=Error(Q(130,e===null?"null":typeof e,"")),i=null}return t=kn(r,n,t,s),t.elementType=e,t.type=i,t.lanes=a,t}function Za(e,t,n,i){return e=kn(7,e,i,t),e.lanes=n,e}function Up(e,t,n){return e=kn(6,e,null,t),e.lanes=n,e}function nS(e){var t=kn(18,null,null,0);return t.stateNode=e,t}function Lp(e,t,n){return t=kn(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var ty=new WeakMap;function xi(e,t){if(typeof e=="object"&&e!==null){var n=ty.get(e);return n!==void 0?n:(t={value:e,source:t,stack:Uv(t)},ty.set(e,t),t)}return{value:e,source:t,stack:Uv(t)}}var Wr=[],qr=0,oh=null,Hl=0,_i=[],vi=0,ga=null,$i=1,ts="";function xs(e,t){Wr[qr++]=Hl,Wr[qr++]=oh,oh=e,Hl=t}function iS(e,t,n){_i[vi++]=$i,_i[vi++]=ts,_i[vi++]=ga,ga=e;var i=$i;e=ts;var s=32-ii(i)-1;i&=~(1<<s),n+=1;var a=32-ii(t)+s;if(30<a){var r=s-s%5;a=(i&(1<<r)-1).toString(32),i>>=r,s-=r,$i=1<<32-ii(t)+s|n<<s|i,ts=a+e}else $i=1<<a|n<<s|i,ts=e}function Ph(e){e.return!==null&&(xs(e,1),iS(e,1,0))}function Mg(e){for(;e===oh;)oh=Wr[--qr],Wr[qr]=null,Hl=Wr[--qr],Wr[qr]=null;for(;e===ga;)ga=_i[--vi],_i[vi]=null,ts=_i[--vi],_i[vi]=null,$i=_i[--vi],_i[vi]=null}function sS(e,t){_i[vi++]=$i,_i[vi++]=ts,_i[vi++]=ga,$i=t.id,ts=t.overflow,ga=e}var cn=null,Ne=null,Zt=!1,oa=null,Si=!1,gm=Error(Q(519));function _a(e){var t=Error(Q(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?"text":"HTML",""));throw Vl(xi(t,e)),gm}function ey(e){var t=e.stateNode,n=e.type,i=e.memoizedProps;switch(t[pn]=e,t[qn]=i,n){case"dialog":Kt("cancel",t),Kt("close",t);break;case"iframe":case"object":case"embed":Kt("load",t);break;case"video":case"audio":for(n=0;n<Wl.length;n++)Kt(Wl[n],t);break;case"source":Kt("error",t);break;case"img":case"image":case"link":Kt("error",t),Kt("load",t);break;case"details":Kt("toggle",t);break;case"input":Kt("invalid",t),Ox(t,i.value,i.defaultValue,i.checked,i.defaultChecked,i.type,i.name,!0);break;case"select":Kt("invalid",t);break;case"textarea":Kt("invalid",t),Px(t,i.value,i.defaultValue,i.children)}n=i.children,typeof n!="string"&&typeof n!="number"&&typeof n!="bigint"||t.textContent===""+n||i.suppressHydrationWarning===!0||HM(t.textContent,n)?(i.popover!=null&&(Kt("beforetoggle",t),Kt("toggle",t)),i.onScroll!=null&&Kt("scroll",t),i.onScrollEnd!=null&&Kt("scrollend",t),i.onClick!=null&&(t.onclick=ji),t=!0):t=!1,t||_a(e,!0)}function lh(e){for(cn=e.return;cn;)switch(cn.tag){case 5:case 31:case 13:Si=!1;return;case 27:case 3:Si=!0;return;default:cn=cn.return}}function Dr(e){if(e!==cn)return!1;if(!Zt)return lh(e),Zt=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=!(n!=="form"&&n!=="button")||tg(e.type,e.memoizedProps)),n=!n),n&&Ne&&_a(e),lh(e),t===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(Q(317));Ne=Qy(e)}else if(t===31){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(Q(317));Ne=Qy(e)}else t===27?(t=Ne,Ma(e.type)?(e=sg,sg=null,Ne=e):Ne=t):Ne=cn?Mi(e.stateNode.nextSibling):null;return!0}function ja(){Ne=cn=null,Zt=!1}function Op(){var e=oa;return e!==null&&(Vn===null?Vn=e:Vn.push.apply(Vn,e),oa=null),e}function Vl(e){oa===null?oa=[e]:oa.push(e)}var _m=ss(null),ur=null,Ss=null;function na(e,t,n){De(_m,t._currentValue),t._currentValue=n}function bs(e){e._currentValue=_m.current,gn(_m)}function Hu(e,t,n){for(;e!==null;){var i=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,i!==null&&(i.childLanes|=t)):i!==null&&(i.childLanes&t)!==t&&(i.childLanes|=t),e===n)break;e=e.return}}function vm(e,t,n,i){var s=e.child;for(s!==null&&(s.return=e);s!==null;){var a=s.dependencies;if(a!==null){var r=s.child;a=a.firstContext;t:for(;a!==null;){var o=a;a=s;for(var l=0;l<t.length;l++)if(o.context===t[l]){a.lanes|=n,o=a.alternate,o!==null&&(o.lanes|=n),Hu(a.return,n,e),i||(r=null);break t}a=o.next}}else if(s.tag===18){if(r=s.return,r===null)throw Error(Q(341));r.lanes|=n,a=r.alternate,a!==null&&(a.lanes|=n),Hu(r,n,e),r=null}else s.tag===13&&s.memoizedState!==null&&s.memoizedState.dehydrated===null?(s.lanes|=n,r=s.alternate,r!==null&&(r.lanes|=n),Hu(s.return,n,e),r=s.child,r=r!==null?r.sibling:null):r=s.child;if(r!==null)r.return=s;else for(r=s;r!==null;){if(r===e){r=null;break}if(s=r.sibling,s!==null){s.return=r.return,r=s;break}r=r.return}s=r}}function $a(e,t,n,i){e=null;for(var s=t,a=!1;s!==null;){if(!a){if((s.flags&524288)!==0)a=!0;else if((s.flags&262144)!==0)break}if(s.tag===10){var r=s.alternate;if(r===null)throw Error(Q(387));if(r=r.memoizedProps,r!==null){var o=s.type;ai(s.pendingProps.value,r.value)||(e!==null?e.push(o):e=[o])}}else if(s===th.current){if(r=s.alternate,r===null)throw Error(Q(387));r.memoizedState.memoizedState!==s.memoizedState.memoizedState&&(e!==null?e.push(mo):e=[mo])}s=s.return}return e!==null&&vm(t,e,n,i),t.flags|=262144,e!==null}function ch(e){for(e=e.firstContext;e!==null;){if(!ai(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function tr(e){ur=e,Ss=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function mn(e){return aS(ur,e)}function Mu(e,t){return ur===null&&tr(e),aS(e,t)}function aS(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},Ss===null){if(e===null)throw Error(Q(308));Ss=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else Ss=Ss.next=t;return n}var hA=typeof AbortController<"u"?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(n,i){e.push(i)}};this.abort=function(){t.aborted=!0,e.forEach(function(n){return n()})}},fA=tn.unstable_scheduleCallback,dA=tn.unstable_NormalPriority,Je={$$typeof:Qi,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function bg(){return{controller:new hA,data:new Map,refCount:0}}function sc(e){e.refCount--,e.refCount===0&&fA(dA,function(){e.controller.abort()})}function ny(e,t){if((e.pendingLanes&4194048)!==0){var n=e.transitionTypes;for(n===null&&(n=e.transitionTypes=[]),e=0;e<t.length;e++){var i=t[e];n.indexOf(i)===-1&&n.push(i)}}}var Sl=null;function pA(e){var t=e.transitionTypes;return e.transitionTypes=null,t}var Al=null,ym=0,er=0,Qr=null;function mA(e,t){if(Al===null){var n=Al=[];ym=0,er=Qg(),Qr={status:"pending",value:void 0,then:function(i){n.push(i)}}}return ym++,t.then(iy,iy),t}function iy(){if(--ym===0&&(Sl=null,Al!==null)){Qr!==null&&(Qr.status="fulfilled");var e=Al;Al=null,er=0,Qr=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function gA(e,t){var n=[],i={status:"pending",value:null,reason:null,then:function(s){n.push(s)}};return e.then(function(){i.status="fulfilled",i.value=t;for(var s=0;s<n.length;s++)(0,n[s])(t)},function(s){for(i.status="rejected",i.reason=s,s=0;s<n.length;s++)(0,n[s])(void 0)}),i}var sy=Lt.S;Lt.S=function(e,t){if(bM=ei(),typeof t=="object"&&t!==null&&typeof t.then=="function"&&mA(e,t),Sl!==null)for(var n=ho;n!==null;)ny(n,Sl),n=n.next;if(n=e.types,n!==null){for(var i=ho;i!==null;)ny(i,n),i=i.next;if(er!==0){i=Sl,i===null&&(i=Sl=[]);for(var s=0;s<n.length;s++){var a=n[s];i.indexOf(a)===-1&&i.push(a)}}}sy!==null&&sy(e,t)};var Ja=ss(null);function Eg(){var e=Ja.current;return e!==null?e:be.pooledCache}function Vu(e,t){t===null?De(Ja,Ja.current):De(Ja,t.pool)}function rS(){var e=Eg();return e===null?null:{parent:Je._currentValue,pool:e}}var xo=Error(Q(460)),Tg=Error(Q(474)),Bh=Error(Q(542)),uh={then:function(){}};function ay(e){return e=e.status,e==="fulfilled"||e==="rejected"}function oS(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(ji,ji),t=n),t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,oy(e),e===void 0&&!("reason"in t)?Error(Q(600)):e;default:if(typeof t.status=="string")t.then(ji,ji);else{if(e=be,e!==null&&100<e.shellSuspendCounter)throw Error(Q(482));e=t,e.status="pending",e.then(function(i){if(t.status==="pending"){var s=t;s.status="fulfilled",s.value=i}},function(i){if(t.status==="pending"){var s=t;s.status="rejected",s.reason=i}})}switch(t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,oy(e),e}throw Ka=t,xo}}function ka(e){try{var t=e._init;return t(e._payload)}catch(n){throw n!==null&&typeof n=="object"&&typeof n.then=="function"?(Ka=n,xo):n}}var Ka=null;function ry(){if(Ka===null)throw Error(Q(459));var e=Ka;return Ka=null,e}function oy(e){if(e===xo||e===Bh)throw Error(Q(483))}var jr=null,Gl=0;function bu(e){var t=Gl;return Gl+=1,jr===null&&(jr=[]),oS(jr,e,t)}function Zs(e,t){t=t.props.ref,e.ref=t!==void 0?t:null}function Eu(e,t){throw t.$$typeof===KE?Error(Q(525)):(e=Object.prototype.toString.call(t),Error(Q(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)))}function lS(e){function t(h,m){if(e){var S=h.deletions;S===null?(h.deletions=[m],h.flags|=16):S.push(m)}}function n(h,m){if(!e)return null;for(;m!==null;)t(h,m),m=m.sibling;return null}function i(h){for(var m=new Map;h!==null;)h.key===null?m.set(h.index,h):m.set(h.key,h),h=h.sibling;return m}function s(h,m){return h=Ms(h,m),h.index=0,h.sibling=null,h}function a(h,m,S){return h.index=S,e?(S=h.alternate,S!==null?(S=S.index,S<m?(h.flags|=2,m):S):(h.flags|=134217730,m)):(h.flags|=1048576,m)}function r(h){return e&&h.alternate===null&&(h.flags|=134217730),h}function o(h,m,S,y){return m===null||m.tag!==6?(m=Up(S,h.mode,y),m.return=h,m):(m=s(m,S),m.return=h,m)}function l(h,m,S,y){var E=S.type;return E===Br?(h=f(h,m,S.props.children,y,S.key),Zs(h,S),h):m!==null&&(m.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===Qs&&ka(E)===m.type)?(m=s(m,S.props),Zs(m,S),m.return=h,m):(m=Fu(S.type,S.key,S.props,null,h.mode,y),Zs(m,S),m.return=h,m)}function c(h,m,S,y){return m===null||m.tag!==4||m.stateNode.containerInfo!==S.containerInfo||m.stateNode.implementation!==S.implementation?(m=Lp(S,h.mode,y),m.return=h,m):(m=s(m,S.children||[]),m.return=h,m)}function f(h,m,S,y,E){return m===null||m.tag!==7?(m=Za(S,h.mode,y,E),m.return=h,m):(m=s(m,S),m.return=h,m)}function p(h,m,S){if(typeof m=="string"&&m!==""||typeof m=="number"||typeof m=="bigint")return m=Up(""+m,h.mode,S),m.return=h,m;if(typeof m=="object"&&m!==null){switch(m.$$typeof){case pu:return S=Fu(m.type,m.key,m.props,null,h.mode,S),Zs(S,m),S.return=h,S;case vl:return m=Lp(m,h.mode,S),m.return=h,m;case Qs:return m=ka(m),p(h,m,S)}if(yl(m)||fl(m))return m=Za(m,h.mode,S,null),m.return=h,m;if(typeof m.then=="function")return p(h,bu(m),S);if(m.$$typeof===Qi)return p(h,Mu(h,m),S);Eu(h,m)}return null}function u(h,m,S,y){var E=m!==null?m.key:null;if(typeof S=="string"&&S!==""||typeof S=="number"||typeof S=="bigint")return E!==null?null:o(h,m,""+S,y);if(typeof S=="object"&&S!==null){switch(S.$$typeof){case pu:return S.key===E?l(h,m,S,y):null;case vl:return S.key===E?c(h,m,S,y):null;case Qs:return S=ka(S),u(h,m,S,y)}if(yl(S)||fl(S))return E!==null?null:f(h,m,S,y,null);if(typeof S.then=="function")return u(h,m,bu(S),y);if(S.$$typeof===Qi)return u(h,m,Mu(h,S),y);Eu(h,S)}return null}function d(h,m,S,y,E){if(typeof y=="string"&&y!==""||typeof y=="number"||typeof y=="bigint")return h=h.get(S)||null,o(m,h,""+y,E);if(typeof y=="object"&&y!==null){switch(y.$$typeof){case pu:return h=h.get(y.key===null?S:y.key)||null,l(m,h,y,E);case vl:return h=h.get(y.key===null?S:y.key)||null,c(m,h,y,E);case Qs:return y=ka(y),d(h,m,S,y,E)}if(yl(y)||fl(y))return h=h.get(S)||null,f(m,h,y,E,null);if(typeof y.then=="function")return d(h,m,S,bu(y),E);if(y.$$typeof===Qi)return d(h,m,S,Mu(m,y),E);Eu(m,y)}return null}function v(h,m,S,y){for(var E=null,A=null,C=m,g=m=0,b=null;C!==null&&g<S.length;g++){C.index>g?(b=C,C=null):b=C.sibling;var R=u(h,C,S[g],y);if(R===null){C===null&&(C=b);break}e&&C&&R.alternate===null&&t(h,C),m=a(R,m,g),A===null?E=R:A.sibling=R,A=R,C=b}if(g===S.length)return n(h,C),Zt&&xs(h,g),E;if(C===null){for(;g<S.length;g++)C=p(h,S[g],y),C!==null&&(m=a(C,m,g),A===null?E=C:A.sibling=C,A=C);return Zt&&xs(h,g),E}for(C=i(C);g<S.length;g++)b=d(C,h,g,S[g],y),b!==null&&(e&&(R=b.alternate,R!==null&&C.delete(R.key===null?g:R.key)),m=a(b,m,g),A===null?E=b:A.sibling=b,A=b);return e&&C.forEach(function(U){return t(h,U)}),Zt&&xs(h,g),E}function M(h,m,S,y){if(S==null)throw Error(Q(151));for(var E=null,A=null,C=m,g=m=0,b=null,R=S.next();C!==null&&!R.done;g++,R=S.next()){C.index>g?(b=C,C=null):b=C.sibling;var U=u(h,C,R.value,y);if(U===null){C===null&&(C=b);break}e&&C&&U.alternate===null&&t(h,C),m=a(U,m,g),A===null?E=U:A.sibling=U,A=U,C=b}if(R.done)return n(h,C),Zt&&xs(h,g),E;if(C===null){for(;!R.done;g++,R=S.next())R=p(h,R.value,y),R!==null&&(m=a(R,m,g),A===null?E=R:A.sibling=R,A=R);return Zt&&xs(h,g),E}for(C=i(C);!R.done;g++,R=S.next())R=d(C,h,g,R.value,y),R!==null&&(e&&(b=R.alternate,b!==null&&C.delete(b.key===null?g:b.key)),m=a(R,m,g),A===null?E=R:A.sibling=R,A=R);return e&&C.forEach(function(I){return t(h,I)}),Zt&&xs(h,g),E}function _(h,m,S,y){if(typeof S=="object"&&S!==null&&S.type===Br&&S.key===null&&S.props.ref===void 0&&(S=S.props.children),typeof S=="object"&&S!==null){switch(S.$$typeof){case pu:t:{for(var E=S.key;m!==null;){if(m.key===E){if(E=S.type,E===Br){if(m.tag===7){n(h,m.sibling),y=s(m,S.props.children),Zs(y,S),y.return=h,h=y;break t}}else if(m.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===Qs&&ka(E)===m.type){n(h,m.sibling),y=s(m,S.props),Zs(y,S),y.return=h,h=y;break t}n(h,m);break}else t(h,m);m=m.sibling}S.type===Br?(y=Za(S.props.children,h.mode,y,S.key),Zs(y,S),y.return=h,h=y):(y=Fu(S.type,S.key,S.props,null,h.mode,y),Zs(y,S),y.return=h,h=y)}return r(h);case vl:t:{for(E=S.key;m!==null;){if(m.key===E)if(m.tag===4&&m.stateNode.containerInfo===S.containerInfo&&m.stateNode.implementation===S.implementation){n(h,m.sibling),y=s(m,S.children||[]),y.return=h,h=y;break t}else{n(h,m);break}else t(h,m);m=m.sibling}y=Lp(S,h.mode,y),y.return=h,h=y}return r(h);case Qs:return S=ka(S),_(h,m,S,y)}if(yl(S))return v(h,m,S,y);if(fl(S)){if(E=fl(S),typeof E!="function")throw Error(Q(150));return S=E.call(S),M(h,m,S,y)}if(typeof S.then=="function")return _(h,m,bu(S),y);if(S.$$typeof===Qi)return _(h,m,Mu(h,S),y);Eu(h,S)}return typeof S=="string"&&S!==""||typeof S=="number"||typeof S=="bigint"?(S=""+S,m!==null&&m.tag===6?(n(h,m.sibling),y=s(m,S),y.return=h,h=y):(n(h,m),y=Up(S,h.mode,y),y.return=h,h=y),r(h)):n(h,m)}return function(h,m,S,y){try{Gl=0;var E=_(h,m,S,y);return jr=null,E}catch(C){if(C===xo||C===Bh)throw C;var A=kn(29,C,null,h.mode);return A.lanes=y,A.return=h,A}}}var nr=lS(!0),cS=lS(!1),js=!1;function Ag(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function xm(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function la(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function ca(e,t,n){var i=e.updateQueue;if(i===null)return null;if(i=i.shared,(le&2)!==0){var s=i.pending;return s===null?t.next=t:(t.next=s.next,s.next=t),i.pending=t,t=rh(e),tS(e,null,n),t}return Ih(e,i,t,n),rh(e)}function wl(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194048)!==0)){var i=t.lanes;i&=e.pendingLanes,n|=i,t.lanes=n,Ax(e,n)}}function Ip(e,t){var n=e.updateQueue,i=e.alternate;if(i!==null&&(i=i.updateQueue,n===i)){var s=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var r={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?s=a=r:a=a.next=r,n=n.next}while(n!==null);a===null?s=a=t:a=a.next=t}else s=a=t;n={baseState:i.baseState,firstBaseUpdate:s,lastBaseUpdate:a,shared:i.shared,callbacks:i.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var Sm=!1;function Cl(){if(Sm){var e=Qr;if(e!==null)throw e}}function Rl(e,t,n,i){Sm=!1;var s=e.updateQueue;js=!1;var a=s.firstBaseUpdate,r=s.lastBaseUpdate,o=s.shared.pending;if(o!==null){s.shared.pending=null;var l=o,c=l.next;l.next=null,r===null?a=c:r.next=c,r=l;var f=e.alternate;f!==null&&(f=f.updateQueue,o=f.lastBaseUpdate,o!==r&&(o===null?f.firstBaseUpdate=c:o.next=c,f.lastBaseUpdate=l))}if(a!==null){var p=s.baseState;r=0,f=c=l=null,o=a;do{var u=o.lane&-536870913,d=u!==o.lane;if(d?($t&u)===u:(i&u)===u){u!==0&&u===er&&(Sm=!0),f!==null&&(f=f.next={lane:0,tag:o.tag,payload:o.payload,callback:null,next:null});t:{var v=e,M=o;u=t;var _=n;switch(M.tag){case 1:if(v=M.payload,typeof v=="function"){p=v.call(_,p,u);break t}p=v;break t;case 3:v.flags=v.flags&-65537|128;case 0:if(v=M.payload,u=typeof v=="function"?v.call(_,p,u):v,u==null)break t;p=Ee({},p,u);break t;case 2:js=!0}}u=o.callback,u!==null&&(e.flags|=64,d&&(e.flags|=8192),d=s.callbacks,d===null?s.callbacks=[u]:d.push(u))}else d={lane:u,tag:o.tag,payload:o.payload,callback:o.callback,next:null},f===null?(c=f=d,l=p):f=f.next=d,r|=u;if(o=o.next,o===null){if(o=s.shared.pending,o===null)break;d=o,o=d.next,d.next=null,s.lastBaseUpdate=d,s.shared.pending=null}}while(!0);f===null&&(l=p),s.baseState=l,s.firstBaseUpdate=c,s.lastBaseUpdate=f,a===null&&(s.shared.lanes=0),xa|=r,e.lanes=r,e.memoizedState=p}}function uS(e,t){if(typeof e!="function")throw Error(Q(191,e));e.call(t)}function hS(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)uS(n[e],t)}var va=ss(null),hh=ss(0);function ly(e,t){e=Rs,De(hh,e),De(va,t),Rs=e|t.baseLanes}function Mm(){De(hh,Rs),De(va,va.current)}function wg(){Rs=hh.current,gn(va),gn(hh)}var yn=ss(null),wn=null;function ua(e){var t=e.alternate;De(_n,_n.current&1),De(yn,e),wn===null&&(t===null||va.current!==null||t.memoizedState!==null)&&(wn=e)}function bm(e){De(_n,_n.current),De(yn,e),wn===null&&(wn=e)}function fS(e){e.tag===22?(De(_n,_n.current),De(yn,e),wn===null&&(wn=e)):ha()}function ha(){De(_n,_n.current),De(yn,yn.current)}function jn(e){gn(yn),wn===e&&(wn=null),gn(_n)}var _n=ss(0);function kl(e,t){De(yn,yn.current),De(_n,t)}function Cg(e){gn(_n),gn(yn),wn===e&&(wn=null)}function fh(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||ig(n)||e0(n)))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!=="independent"){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var As=0,Ft=null,ye=null,Ze=null,dh=!1,$r=!1,ir=!1,ph=0,Xl=0,to=null,_A=0;function He(){throw Error(Q(321))}function Rg(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!ai(e[n],t[n]))return!1;return!0}function Ng(e,t,n,i,s,a){return As=a,Ft=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,Lt.H=e===null||e.memoizedState===null?kS:XS,ir=!1,a=n(i,s),ir=!1,$r&&(a=pS(t,n,i,s)),dS(e),a}function dS(e){Lt.H=mh;var t=ye!==null&&ye.next!==null;if(As=0,Ze=ye=Ft=null,dh=!1,Xl=0,to=null,t)throw Error(Q(300));e===null||Ke||(e=e.dependencies,e!==null&&ch(e)&&(Ke=!0))}function pS(e,t,n,i){Ft=e;var s=0;do{if($r&&(to=null),Xl=0,$r=!1,25<=s)throw Error(Q(301));if(s+=1,Ze=ye=null,e.updateQueue!=null){var a=e.updateQueue;a.lastEffect=null,a.events=null,a.stores=null,a.memoCache!=null&&(a.memoCache.index=0)}Lt.H=TA,a=t(n,i)}while($r);return a}function vA(){var e=Lt.H,t=e.useState()[0];return t=typeof t.then=="function"?ac(t):t,e=e.useState()[0],(ye!==null?ye.memoizedState:null)!==e&&(Ft.flags|=1024),t}function Dg(){var e=ph!==0;return ph=0,e}function Ug(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Lg(e){if(dh){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}dh=!1}As=0,Ze=ye=Ft=null,$r=!1,Xl=ph=0,to=null}function In(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Ze===null?Ft.memoizedState=Ze=e:Ze=Ze.next=e,Ze}function We(){if(ye===null){var e=Ft.alternate;e=e!==null?e.memoizedState:null}else e=ye.next;var t=Ze===null?Ft.memoizedState:Ze.next;if(t!==null)Ze=t,ye=e;else{if(e===null)throw Ft.alternate===null?Error(Q(467)):Error(Q(310));ye=e,e={memoizedState:ye.memoizedState,baseState:ye.baseState,baseQueue:ye.baseQueue,queue:ye.queue,next:null},Ze===null?Ft.memoizedState=Ze=e:Ze=Ze.next=e}return Ze}function zh(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function ac(e){var t=Xl;return Xl+=1,to===null&&(to=[]),e=oS(to,e,t),t=Ft,(Ze===null?t.memoizedState:Ze.next)===null&&(t=t.alternate,Lt.H=t===null||t.memoizedState===null?kS:XS),e}function Fh(e){if(e!==null&&typeof e=="object"){if(typeof e.then=="function")return ac(e);if(e.$$typeof===$E)return;if(e.$$typeof===Qi)return mn(e)}throw Error(Q(438,String(e)))}function Og(e){var t=null,n=Ft.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var i=Ft.alternate;i!==null&&(i=i.updateQueue,i!==null&&(i=i.memoCache,i!=null&&(t={data:i.data.map(function(s){return s.slice()}),index:0})))}if(t==null&&(t={data:[],index:0}),n===null&&(n=zh(),Ft.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),i=0;i<e;i++)n[i]=jE;return t.index++,n}function ws(e,t){return typeof t=="function"?t(e):t}function Gu(e){var t=We();return Ig(t,ye,e)}function Ig(e,t,n){var i=e.queue;if(i===null)throw Error(Q(311));i.lastRenderedReducer=n;var s=e.baseQueue,a=i.pending;if(a!==null){if(s!==null){var r=s.next;s.next=a.next,a.next=r}t.baseQueue=s=a,i.pending=null}if(a=e.baseState,s===null)e.memoizedState=a;else{t=s.next;var o=r=null,l=null,c=t,f=!1;do{var p=c.lane&-536870913;if(p!==c.lane?($t&p)===p:(As&p)===p){var u=c.revertLane;if(u===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),p===er&&(f=!0);else if((As&u)===u){c=c.next,u===er&&(f=!0);continue}else p={lane:0,revertLane:c.revertLane,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},l===null?(o=l=p,r=a):l=l.next=p,Ft.lanes|=u,xa|=u;p=c.action,ir&&n(a,p),a=c.hasEagerState?c.eagerState:n(a,p)}else u={lane:p,revertLane:c.revertLane,gesture:c.gesture,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},l===null?(o=l=u,r=a):l=l.next=u,Ft.lanes|=p,xa|=p;c=c.next}while(c!==null&&c!==t);if(l===null?r=a:l.next=o,!ai(a,e.memoizedState)&&(Ke=!0,f&&(n=Qr,n!==null)))throw n;e.memoizedState=a,e.baseState=r,e.baseQueue=l,i.lastRenderedState=a}return s===null&&(i.lanes=0),[e.memoizedState,i.dispatch]}function Pp(e){var t=We(),n=t.queue;if(n===null)throw Error(Q(311));n.lastRenderedReducer=e;var i=n.dispatch,s=n.pending,a=t.memoizedState;if(s!==null){n.pending=null;var r=s=s.next;do a=e(a,r.action),r=r.next;while(r!==s);ai(a,t.memoizedState)||(Ke=!0),t.memoizedState=a,t.baseQueue===null&&(t.baseState=a),n.lastRenderedState=a}return[a,i]}function mS(e,t,n){var i=Ft,s=We(),a=Zt;if(a){if(n===void 0)throw Error(Q(407));n=n()}else n=t();var r=!ai((ye||s).memoizedState,n);if(r&&(s.memoizedState=n,Ke=!0),s=s.queue,Pg(vS.bind(null,i,s,e),[e]),e=s.getSnapshot!==t||r||Ze!==null&&(Ze.memoizedState.tag&1)!==0,oo(e?9:8,{destroy:void 0},_S.bind(null,i,s,n,t),null),e){if(i.flags|=2048,be===null)throw Error(Q(349));a||(As&127)!==0||gS(i,t,n)}return n}function gS(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=Ft.updateQueue,t===null?(t=zh(),Ft.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function _S(e,t,n,i){t.value=n,t.getSnapshot=i,yS(t)&&xS(e)}function vS(e,t,n){return n(function(){yS(t)&&xS(e)})}function yS(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!ai(e,n)}catch{return!0}}function xS(e){var t=cr(e,2);t!==null&&Xn(t,e,2)}function Em(e){var t=In();if(typeof e=="function"){var n=e;if(e=n(),ir){ta(!0);try{n()}finally{ta(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:ws,lastRenderedState:e},t}function SS(e,t,n,i){return e.baseState=n,Ig(e,ye,typeof i=="function"?i:ws)}function yA(e,t,n,i,s){if(Vh(e))throw Error(Q(485));if(e=t.action,e!==null){var a={payload:s,action:e,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(r){a.listeners.push(r)}};Lt.T!==null?n(!0):a.isTransition=!1,i(a),n=t.pending,n===null?(a.next=t.pending=a,MS(t,a)):(a.next=n.next,t.pending=n.next=a)}}function MS(e,t){var n=t.action,i=t.payload,s=e.state;if(t.isTransition){var a=Lt.T,r={};r.types=a!==null?a.types:null,Lt.T=r;try{var o=n(s,i),l=Lt.S;l!==null&&l(r,o),cy(e,t,o)}catch(c){Tm(e,t,c)}finally{a!==null&&r.types!==null&&(a.types=r.types),Lt.T=a}}else try{a=n(s,i),cy(e,t,a)}catch(c){Tm(e,t,c)}}function cy(e,t,n){n!==null&&typeof n=="object"&&typeof n.then=="function"?n.then(function(i){uy(e,t,i)},function(i){return Tm(e,t,i)}):uy(e,t,n)}function uy(e,t,n){t.status="fulfilled",t.value=n,bS(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,MS(e,n)))}function Tm(e,t,n){var i=e.pending;if(e.pending=null,i!==null){i=i.next;do t.status="rejected",t.reason=n,bS(t),t=t.next;while(t!==i)}e.action=null}function bS(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function ES(e,t){return t}function hy(e,t){if(Zt){var n=be.formState;if(n!==null){t:{var i=Ft;if(Zt){if(Ne){e:{for(var s=Ne,a=Si;s.nodeType!==8;){if(!a){s=null;break e}if(s=Mi(s.nextSibling),s===null){s=null;break e}}a=s.data,s=a==="F!"||a==="F"?s:null}if(s){Ne=Mi(s.nextSibling),i=s.data==="F!";break t}}_a(i)}i=!1}i&&(t=n[0])}}return n=In(),n.memoizedState=n.baseState=t,i={pending:null,lanes:0,dispatch:null,lastRenderedReducer:ES,lastRenderedState:t},n.queue=i,n=HS.bind(null,Ft,i),i.dispatch=n,i=Em(!1),a=Hg.bind(null,Ft,!1,i.queue),i=In(),s={state:t,dispatch:null,action:e,pending:null},i.queue=s,n=yA.bind(null,Ft,s,a,n),s.dispatch=n,i.memoizedState=e,[t,n,!1]}function fy(e){var t=We();return TS(t,ye,e)}function TS(e,t,n){if(t=Ig(e,t,ES)[0],e=Gu(ws)[0],typeof t=="object"&&t!==null&&typeof t.then=="function")try{var i=ac(t)}catch(r){throw r===xo?Bh:r}else i=t;t=We();var s=t.queue,a=s.dispatch;return n!==t.memoizedState&&(Ft.flags|=2048,oo(9,{destroy:void 0},xA.bind(null,s,n),null)),[i,a,e]}function xA(e,t){e.action=t}function dy(e){var t=We(),n=ye;if(n!==null)return TS(t,n,e);We(),t=t.memoizedState,n=We();var i=n.queue.dispatch;return n.memoizedState=e,[t,i,!1]}function oo(e,t,n,i){return e={tag:e,create:n,deps:i,inst:t,next:null},t=Ft.updateQueue,t===null&&(t=zh(),Ft.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(i=n.next,n.next=e,e.next=i,t.lastEffect=e),e}function AS(){return We().memoizedState}function ku(e,t,n,i){var s=In();Ft.flags|=e,s.memoizedState=oo(1|t,{destroy:void 0},n,i===void 0?null:i)}function Hh(e,t,n,i){var s=We();i=i===void 0?null:i;var a=s.memoizedState.inst;ye!==null&&i!==null&&Rg(i,ye.memoizedState.deps)?s.memoizedState=oo(t,a,n,i):(Ft.flags|=e,s.memoizedState=oo(1|t,a,n,i))}function py(e,t){ku(8390656,8,e,t)}function Pg(e,t){Hh(2048,8,e,t)}function SA(e){Ft.flags|=4;var t=Ft.updateQueue;if(t===null)t=zh(),Ft.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function wS(e){var t=We().memoizedState;return SA({ref:t,nextImpl:e}),function(){if((le&2)!==0)throw Error(Q(440));return t.impl.apply(void 0,arguments)}}function CS(e,t){return Hh(4,2,e,t)}function RS(e,t){return Hh(4,4,e,t)}function NS(e,t){if(typeof t=="function"){e=e();var n=t(e);return function(){typeof n=="function"?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function DS(e,t,n){n=n!=null?n.concat([e]):null,Hh(4,4,NS.bind(null,t,e),n)}function Bg(){}function US(e,t){var n=We();t=t===void 0?null:t;var i=n.memoizedState;return t!==null&&Rg(t,i[1])?i[0]:(n.memoizedState=[e,t],e)}function LS(e,t){var n=We();t=t===void 0?null:t;var i=n.memoizedState;if(t!==null&&Rg(t,i[1]))return i[0];if(i=e(),ir){ta(!0);try{e()}finally{ta(!1)}}return n.memoizedState=[i,t],i}function zg(e,t,n){return n===void 0||(As&1073741824)!==0&&($t&261930)===0?e.memoizedState=t:(e.memoizedState=n,e=TM(),Ft.lanes|=e,xa|=e,n)}function OS(e,t,n,i){return ai(n,t)?n:va.current!==null?(e=zg(e,n,i),ai(e,t)||(Ke=!0),e):(As&106)===0||(As&1073741824)!==0&&($t&261930)===0?(Ke=!0,e.memoizedState=n):(e=TM(),Ft.lanes|=e,xa|=e,t)}function IS(e,t,n,i,s){var a=ce.p;ce.p=a!==0&&8>a?a:8;var r=Lt.T,o={};o.types=r!==null?r.types:null,Lt.T=o,Hg(e,!1,t,n);try{var l=s(),c=Lt.S;if(c!==null&&c(o,l),l!==null&&typeof l=="object"&&typeof l.then=="function"){var f=gA(l,i);Nl(e,t,f,si(e))}else Nl(e,t,i,si(e))}catch(p){Nl(e,t,{then:function(){},status:"rejected",reason:p},si())}finally{ce.p=a,r!==null&&o.types!==null&&(r.types=o.types),Lt.T=r}}function MA(){}function Am(e,t,n,i){if(e.tag!==5)throw Error(Q(476));var s=PS(e).queue;IS(e,s,t,Ya,n===null?MA:function(){return BS(e),n(i)})}function PS(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:Ya,baseState:Ya,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:ws,lastRenderedState:Ya},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:ws,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function BS(e){var t=PS(e);t.next===null&&(t=e.alternate.memoizedState),Nl(e,t.next.queue,{},si())}function Fg(){return mn(mo)}function zS(){return We().memoizedState}function FS(){return We().memoizedState}function bA(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=si();e=la(n);var i=ca(t,e,n);i!==null&&(Xn(i,t,n),wl(i,t,n)),t={cache:bg()},e.payload=t;return}t=t.return}}function EA(e,t,n){var i=si();n={lane:i,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Vh(e)?VS(t,n):(n=xg(e,t,n,i),n!==null&&(Xn(n,e,i),GS(n,t,i)))}function HS(e,t,n){var i=si();Nl(e,t,n,i)}function Nl(e,t,n,i){var s={lane:i,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Vh(e))VS(t,s);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var r=t.lastRenderedState,o=a(r,n);if(s.hasEagerState=!0,s.eagerState=o,ai(o,r))return Ih(e,t,s,0),be===null&&Oh(),!1}catch{}if(n=xg(e,t,s,i),n!==null)return Xn(n,e,i),GS(n,t,i),!0}return!1}function Hg(e,t,n,i){if(i={lane:2,revertLane:Qg(),gesture:null,action:i,hasEagerState:!1,eagerState:null,next:null},Vh(e)){if(t)throw Error(Q(479))}else t=xg(e,n,i,2),t!==null&&Xn(t,e,2)}function Vh(e){var t=e.alternate;return e===Ft||t!==null&&t===Ft}function VS(e,t){$r=dh=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function GS(e,t,n){if((n&4194048)!==0){var i=t.lanes;i&=e.pendingLanes,n|=i,t.lanes=n,Ax(e,n)}}var mh={readContext:mn,use:Fh,useCallback:He,useContext:He,useEffect:He,useImperativeHandle:He,useLayoutEffect:He,useInsertionEffect:He,useMemo:He,useReducer:He,useRef:He,useState:He,useDebugValue:He,useDeferredValue:He,useTransition:He,useSyncExternalStore:He,useId:He,useHostTransitionStatus:He,useFormState:He,useActionState:He,useOptimistic:He,useMemoCache:He,useCacheRefresh:He,useEffectEvent:He},kS={readContext:mn,use:Fh,useCallback:function(e,t){return In().memoizedState=[e,t===void 0?null:t],e},useContext:mn,useEffect:py,useImperativeHandle:function(e,t,n){n=n!=null?n.concat([e]):null,ku(4194308,4,NS.bind(null,t,e),n)},useLayoutEffect:function(e,t){return ku(4194308,4,e,t)},useInsertionEffect:function(e,t){ku(4,2,e,t)},useMemo:function(e,t){var n=In();t=t===void 0?null:t;var i=e();if(ir){ta(!0);try{e()}finally{ta(!1)}}return n.memoizedState=[i,t],i},useReducer:function(e,t,n){var i=In();if(n!==void 0){var s=n(t);if(ir){ta(!0);try{n(t)}finally{ta(!1)}}}else s=t;return i.memoizedState=i.baseState=s,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:s},i.queue=e,e=e.dispatch=EA.bind(null,Ft,e),[i.memoizedState,e]},useRef:function(e){var t=In();return e={current:e},t.memoizedState=e},useState:function(e){e=Em(e);var t=e.queue,n=HS.bind(null,Ft,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:Bg,useDeferredValue:function(e,t){var n=In();return zg(n,e,t)},useTransition:function(){var e=Em(!1);return e=IS.bind(null,Ft,e.queue,!0,!1),In().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var i=Ft,s=In();if(Zt){if(n===void 0)throw Error(Q(407));n=n()}else{if(n=t(),be===null)throw Error(Q(349));($t&127)!==0||gS(i,t,n)}s.memoizedState=n;var a={value:n,getSnapshot:t};return s.queue=a,py(vS.bind(null,i,a,e),[e]),i.flags|=2048,oo(9,{destroy:void 0},_S.bind(null,i,a,n,t),null),n},useId:function(){var e=In(),t=be.identifierPrefix;if(Zt){var n=ts,i=$i;n=(i&~(1<<32-ii(i)-1)).toString(32)+n,t="_"+t+"R_"+n,n=ph++,0<n&&(t+="H"+n.toString(32)),t+="_"}else n=_A++,t="_"+t+"r_"+n.toString(32)+"_";return e.memoizedState=t},useHostTransitionStatus:Fg,useFormState:hy,useActionState:hy,useOptimistic:function(e){var t=In();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=Hg.bind(null,Ft,!0,n),n.dispatch=t,[e,t]},useMemoCache:Og,useCacheRefresh:function(){return In().memoizedState=bA.bind(null,Ft)},useEffectEvent:function(e){var t=In(),n={impl:e};return t.memoizedState=n,function(){if((le&2)!==0)throw Error(Q(440));return n.impl.apply(void 0,arguments)}}},XS={readContext:mn,use:Fh,useCallback:US,useContext:mn,useEffect:Pg,useImperativeHandle:DS,useInsertionEffect:CS,useLayoutEffect:RS,useMemo:LS,useReducer:Gu,useRef:AS,useState:function(){return Gu(ws)},useDebugValue:Bg,useDeferredValue:function(e,t){var n=We();return OS(n,ye.memoizedState,e,t)},useTransition:function(){var e=Gu(ws)[0],t=We().memoizedState;return[typeof e=="boolean"?e:ac(e),t]},useSyncExternalStore:mS,useId:zS,useHostTransitionStatus:Fg,useFormState:fy,useActionState:fy,useOptimistic:function(e,t){var n=We();return SS(n,ye,e,t)},useMemoCache:Og,useCacheRefresh:FS,useEffectEvent:wS},TA={readContext:mn,use:Fh,useCallback:US,useContext:mn,useEffect:Pg,useImperativeHandle:DS,useInsertionEffect:CS,useLayoutEffect:RS,useMemo:LS,useReducer:Pp,useRef:AS,useState:function(){return Pp(ws)},useDebugValue:Bg,useDeferredValue:function(e,t){var n=We();return ye===null?zg(n,e,t):OS(n,ye.memoizedState,e,t)},useTransition:function(){var e=Pp(ws)[0],t=We().memoizedState;return[typeof e=="boolean"?e:ac(e),t]},useSyncExternalStore:mS,useId:zS,useHostTransitionStatus:Fg,useFormState:dy,useActionState:dy,useOptimistic:function(e,t){var n=We();return ye!==null?SS(n,ye,e,t):(n.baseState=e,[e,n.queue.dispatch])},useMemoCache:Og,useCacheRefresh:FS,useEffectEvent:wS};function Bp(e,t,n,i){t=e.memoizedState,n=n(i,t),n=n==null?t:Ee({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var wm={enqueueSetState:function(e,t,n){e=e._reactInternals;var i=si(),s=la(i);s.payload=t,n!=null&&(s.callback=n),t=ca(e,s,i),t!==null&&(Xn(t,e,i),wl(t,e,i))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var i=si(),s=la(i);s.tag=1,s.payload=t,n!=null&&(s.callback=n),t=ca(e,s,i),t!==null&&(Xn(t,e,i),wl(t,e,i))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=si(),i=la(n);i.tag=2,t!=null&&(i.callback=t),t=ca(e,i,n),t!==null&&(Xn(t,e,n),wl(t,e,n))}};function my(e,t,n,i,s,a,r){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(i,a,r):t.prototype&&t.prototype.isPureReactComponent?!Fl(n,i)||!Fl(s,a):!0}function gy(e,t,n,i){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,i),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,i),t.state!==e&&wm.enqueueReplaceState(t,t.state,null)}function sr(e,t){var n=t;if("ref"in t){n={};for(var i in t)i!=="ref"&&(n[i]=t[i])}if(e=e.defaultProps){n===t&&(n=Ee({},n));for(var s in e)n[s]===void 0&&(n[s]=e[s])}return n}function WS(e){ah(e)}function qS(e){console.error(e)}function YS(e){ah(e)}function gh(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(i){setTimeout(function(){throw i})}}function _y(e,t,n){try{var i=e.onCaughtError;i(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(s){setTimeout(function(){throw s})}}function Cm(e,t,n){return n=la(n),n.tag=3,n.payload={element:null},n.callback=function(){gh(e,t)},n}function ZS(e){return e=la(e),e.tag=3,e}function JS(e,t,n,i){var s=n.type.getDerivedStateFromError;if(typeof s=="function"){var a=i.value;e.payload=function(){return s(a)},e.callback=function(){_y(t,n,i)}}var r=n.stateNode;r!==null&&typeof r.componentDidCatch=="function"&&(e.callback=function(){_y(t,n,i),typeof s!="function"&&(fa===null?fa=new Set([this]):fa.add(this));var o=i.stack;this.componentDidCatch(i.value,{componentStack:o!==null?o:""})})}function AA(e,t,n,i,s){if(n.flags|=32768,i!==null&&typeof i=="object"&&typeof i.then=="function"){if(t=n.alternate,t!==null&&$a(t,n,s,!0),n=yn.current,n!==null){switch(n.tag){case 31:case 13:case 19:return wn===null?Eh():n.alternate===null&&Ve===0&&(Ve=3),n.flags&=-257,n.flags|=65536,n.lanes=s,i===uh?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([i]):t.add(i),Xp(e,i,s)),!1;case 22:return n.flags|=65536,i===uh?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([i])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([i]):n.add(i)),Xp(e,i,s)),!1}throw Error(Q(435,n.tag))}return Xp(e,i,s),Eh(),!1}if(Zt)return t=yn.current,t!==null?((t.flags&65536)===0&&(t.flags|=256),t.flags|=65536,t.lanes=s,i!==gm&&(e=Error(Q(422),{cause:i}),Vl(xi(e,n)))):(i!==gm&&(t=Error(Q(423),{cause:i}),Vl(xi(t,n))),e=e.current.alternate,e.flags|=65536,s&=-s,e.lanes|=s,i=xi(i,n),s=Cm(e.stateNode,i,s),Ip(e,s),Ve!==4&&(Ve=2)),!1;var a=Error(Q(520),{cause:i});if(a=xi(a,n),Ol===null?Ol=[a]:Ol.push(a),Ve!==4&&(Ve=2),t===null)return!0;i=xi(i,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=s&-s,n.lanes|=e,e=Cm(n.stateNode,i,e),Ip(n,e),!1;case 1:if(t=n.type,a=n.stateNode,(n.flags&128)===0&&(typeof t.getDerivedStateFromError=="function"||a!==null&&typeof a.componentDidCatch=="function"&&(fa===null||!fa.has(a))))return n.flags|=65536,s&=-s,n.lanes|=s,s=ZS(s),JS(s,e,n,i),Ip(n,s),!1;break;case 22:if(n.memoizedState!==null)return n.flags|=65536,!1}n=n.return}while(n!==null);return!1}var Vg=Error(Q(461)),Ke=!1;function je(e,t,n,i){t.child=e===null?cS(t,null,n,i):nr(t,e.child,n,i)}function vy(e,t,n,i,s){n=n.render;var a=t.ref;if("ref"in i){var r={};for(var o in i)o!=="ref"&&(r[o]=i[o])}else r=i;return tr(t),i=Ng(e,t,n,r,a,s),o=Dg(),e!==null&&!Ke?(Ug(e,t,s),Cs(e,t,s)):(Zt&&o&&Ph(t),t.flags|=1,je(e,t,i,s),t.child)}function yy(e,t,n,i,s){if(e===null){var a=n.type;return typeof a=="function"&&!Sg(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,KS(e,t,a,i,s)):(e=Fu(n.type,null,i,t,t.mode,s),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!kg(e,s)){var r=a.memoizedProps;if(n=n.compare,n=n!==null?n:Fl,n(r,i)&&e.ref===t.ref)return Cs(e,t,s)}return t.flags|=1,e=Ms(a,i),e.ref=t.ref,e.return=t,t.child=e}function KS(e,t,n,i,s){if(e!==null){var a=e.memoizedProps;if(Fl(a,i)&&e.ref===t.ref)if(Ke=!1,t.pendingProps=i=a,kg(e,s))(e.flags&131072)!==0&&(Ke=!0);else return t.lanes=e.lanes,Cs(e,t,s)}return Rm(e,t,n,i,s)}function QS(e,t,n,i){var s=i.children,a=e!==null?e.memoizedState:null;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),i.mode==="hidden"){if((t.flags&128)!==0){if(a=a!==null?a.baseLanes|n:n,e!==null){for(i=t.child=e.child,s=0;i!==null;)s=s|i.lanes|i.childLanes,i=i.sibling;i=s&~a}else i=0,t.child=null;return xy(e,t,a,n,i)}if((n&536870912)!==0)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Vu(t,a!==null?a.cachePool:null),a!==null?ly(t,a):Mm(),fS(t);else return i=t.lanes=536870912,xy(e,t,a!==null?a.baseLanes|n:n,n,i)}else a!==null?(Vu(t,a.cachePool),ly(t,a),ha(),t.memoizedState=null):(e!==null&&Vu(t,null),Mm(),ha());return je(e,t,s,n),t.child}function Dl(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function xy(e,t,n,i,s){var a=Eg();return a=a===null?null:{parent:Je._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&Vu(t,null),Mm(),fS(t),e!==null&&$a(e,t,i,!0),t.childLanes=s,null}function Xu(e,t){return t=Gh({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function Sy(e,t,n){return nr(t,e.child,null,n),e=Xu(t,t.pendingProps),e.flags|=2,jn(t),t.memoizedState=null,e}function wA(e,t,n){var i=t.pendingProps,s=(t.flags&128)!==0;if(t.flags&=-129,e===null){if(Zt){if(i.mode==="hidden")return e=Xu(t,i),t.lanes=536870912,e.memoizedState={baseLanes:0,cachePool:null},Dl(null,e);if(bm(t),(e=Ne)?(e=QM(e,Si),e=e!==null&&e.data==="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:ga!==null?{id:$i,overflow:ts}:null,retryLane:536870912,hydrationErrors:null},n=nS(e),n.return=t,t.child=n,cn=t,Ne=null)):e=null,e===null)throw _a(t);return t.lanes=536870912,null}return Xu(t,i)}var a=e.memoizedState;if(a!==null){var r=a.dehydrated;if(bm(t),s)if(t.flags&256)t.flags&=-257,t=Sy(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(Q(558));else if(Ke||$a(e,t,n,!1),s=(n&e.childLanes)!==0,Ke||s){if(va.current===null){if(i=be,i!==null&&(r=wx(i,n),r!==0&&r!==a.retryLane))throw a.retryLane=r,cr(e,r),Xn(i,e,r),Vg;Eh()}t=Sy(e,t,n)}else e=a.treeContext,Ne=Mi(r.nextSibling),cn=t,Zt=!0,oa=null,Si=!1,e!==null&&sS(t,e),t=Xu(t,i),t.flags|=134221824;return t}return e=Ms(e.child,{mode:i.mode,children:i.children}),e.ref=t.ref,t.child=e,e.return=t,e}function Lr(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!="function"&&typeof n!="object")throw Error(Q(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function Rm(e,t,n,i,s){return tr(t),n=Ng(e,t,n,i,void 0,s),i=Dg(),e!==null&&!Ke?(Ug(e,t,s),Cs(e,t,s)):(Zt&&i&&Ph(t),t.flags|=1,je(e,t,n,s),t.child)}function My(e,t,n,i,s,a){return tr(t),t.updateQueue=null,n=pS(t,i,n,s),dS(e),i=Dg(),e!==null&&!Ke?(Ug(e,t,a),Cs(e,t,a)):(Zt&&i&&Ph(t),t.flags|=1,je(e,t,n,a),t.child)}function by(e,t,n,i,s){if(tr(t),t.stateNode===null){var a=Xr,r=n.contextType;typeof r=="object"&&r!==null&&(a=mn(r)),a=new n(i,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=wm,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=i,a.state=t.memoizedState,a.refs={},Ag(t),r=n.contextType,a.context=typeof r=="object"&&r!==null?mn(r):Xr,a.state=t.memoizedState,r=n.getDerivedStateFromProps,typeof r=="function"&&(Bp(t,n,r,i),a.state=t.memoizedState),typeof n.getDerivedStateFromProps=="function"||typeof a.getSnapshotBeforeUpdate=="function"||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(r=a.state,typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount(),r!==a.state&&wm.enqueueReplaceState(a,a.state,null),Rl(t,i,a,s),Cl(),a.state=t.memoizedState),typeof a.componentDidMount=="function"&&(t.flags|=4194308),i=!0}else if(e===null){a=t.stateNode;var o=t.memoizedProps,l=sr(n,o);a.props=l;var c=a.context,f=n.contextType;r=Xr,typeof f=="object"&&f!==null&&(r=mn(f));var p=n.getDerivedStateFromProps;f=typeof p=="function"||typeof a.getSnapshotBeforeUpdate=="function",o=t.pendingProps!==o,f||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(o||c!==r)&&gy(t,a,i,r),js=!1;var u=t.memoizedState;a.state=u,Rl(t,i,a,s),Cl(),c=t.memoizedState,o||u!==c||js?(typeof p=="function"&&(Bp(t,n,p,i),c=t.memoizedState),(l=js||my(t,n,l,i,u,c,r))?(f||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount=="function"&&(t.flags|=4194308)):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=i,t.memoizedState=c),a.props=i,a.state=c,a.context=r,i=l):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),i=!1)}else{a=t.stateNode,xm(e,t),r=t.memoizedProps,f=sr(n,r),a.props=f,p=t.pendingProps,u=a.context,c=n.contextType,l=Xr,typeof c=="object"&&c!==null&&(l=mn(c)),o=n.getDerivedStateFromProps,(c=typeof o=="function"||typeof a.getSnapshotBeforeUpdate=="function")||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(r!==p||u!==l)&&gy(t,a,i,l),js=!1,u=t.memoizedState,a.state=u,Rl(t,i,a,s),Cl();var d=t.memoizedState;r!==p||u!==d||js||e!==null&&e.dependencies!==null&&ch(e.dependencies)?(typeof o=="function"&&(Bp(t,n,o,i),d=t.memoizedState),(f=js||my(t,n,f,i,u,d,l)||e!==null&&e.dependencies!==null&&ch(e.dependencies))?(c||typeof a.UNSAFE_componentWillUpdate!="function"&&typeof a.componentWillUpdate!="function"||(typeof a.componentWillUpdate=="function"&&a.componentWillUpdate(i,d,l),typeof a.UNSAFE_componentWillUpdate=="function"&&a.UNSAFE_componentWillUpdate(i,d,l)),typeof a.componentDidUpdate=="function"&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof a.componentDidUpdate!="function"||r===e.memoizedProps&&u===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||r===e.memoizedProps&&u===e.memoizedState||(t.flags|=1024),t.memoizedProps=i,t.memoizedState=d),a.props=i,a.state=d,a.context=l,i=f):(typeof a.componentDidUpdate!="function"||r===e.memoizedProps&&u===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||r===e.memoizedProps&&u===e.memoizedState||(t.flags|=1024),i=!1)}return a=i,Lr(e,t),i=(t.flags&128)!==0,a||i?(a=t.stateNode,n=i&&typeof n.getDerivedStateFromError!="function"?null:a.render(),t.flags|=1,e!==null&&i?(t.child=nr(t,e.child,null,s),t.child=nr(t,null,n,s)):je(e,t,n,s),t.memoizedState=a.state,e=t.child):e=Cs(e,t,s),e}function Ey(e,t,n,i){return ja(),t.flags|=256,je(e,t,n,i),t.child}var Nm={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Dm(e){return{baseLanes:e,cachePool:rS()}}function Um(e,t,n){return e=e!==null?e.childLanes&~n:0,t&&(e|=ti),e}function jS(e,t,n){var i=t.pendingProps,s=!1,a=(t.flags&128)!==0,r;if((r=a)||(r=e!==null&&e.memoizedState===null?!1:(_n.current&2)!==0),r&&(s=!0,t.flags&=-129),r=(t.flags&32)!==0,t.flags&=-33,e===null){if(Zt){if(s?ua(t):ha(),(e=Ne)?(e=QM(e,Si),e=e!==null&&e.data!=="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:ga!==null?{id:$i,overflow:ts}:null,retryLane:536870912,hydrationErrors:null},n=nS(e),n.return=t,t.child=n,cn=t,Ne=null)):e=null,e===null)throw _a(t);return e0(e)?t.lanes=32:t.lanes=536870912,null}return a=i.children,i=i.fallback,s?(ha(),s=t.mode,a=Gh({mode:"hidden",children:a},s),i=Za(i,s,n,null),a.return=t,i.return=t,a.sibling=i,t.child=a,i=t.child,i.memoizedState=Dm(n),i.childLanes=Um(e,r,n),t.memoizedState=Nm,Dl(null,i)):(ua(t),Gg(t,a))}var o=e.memoizedState;if(o!==null){var l=o.dehydrated;if(l!==null)return CA(e,t,a,r,i,l,o,n)}return s?(ha(),s=i.fallback,a=t.mode,o=e.child,l=o.sibling,i=Ms(o,{mode:"hidden",children:i.children}),i.subtreeFlags=o.subtreeFlags&1206910976,l!==null?s=Ms(l,s):(s=Za(s,a,n,null),s.flags|=2),s.return=t,i.return=t,i.sibling=s,t.child=i,Dl(null,i),i=t.child,s=e.child.memoizedState,s===null?s=Dm(n):(a=s.cachePool,a!==null?(o=Je._currentValue,a=a.parent!==o?{parent:o,pool:o}:a):a=rS(),s={baseLanes:s.baseLanes|n,cachePool:a}),i.memoizedState=s,i.childLanes=Um(e,r,n),t.memoizedState=Nm,Dl(e.child,i)):(ua(t),n=e.child,e=n.sibling,n=Ms(n,{mode:"visible",children:i.children}),n.return=t,n.sibling=null,e!==null&&(r=t.deletions,r===null?(t.deletions=[e],t.flags|=16):r.push(e)),t.child=n,t.memoizedState=null,n)}function Gg(e,t){return t=Gh({mode:"visible",children:t},e.mode),t.return=e,e.child=t}function Gh(e,t){return e=kn(22,e,null,t),e.lanes=0,e}function Tu(e,t,n){return nr(t,e.child,null,n),e=Gg(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function CA(e,t,n,i,s,a,r,o){if(n)return t.flags&256?(ua(t),t.flags&=-257,Tu(e,t,o)):t.memoizedState!==null?(ha(),t.child=e.child,t.flags|=128,null):(ha(),a=s.fallback,r=t.mode,s=Gh({mode:"visible",children:s.children},r),a=Za(a,r,o,null),a.flags|=2,s.return=t,a.return=t,s.sibling=a,t.child=s,nr(t,e.child,null,o),s=t.child,s.memoizedState=Dm(o),s.childLanes=Um(e,i,o),t.memoizedState=Nm,Dl(null,s));if(ua(t),e0(a)){if(i=a.nextSibling&&a.nextSibling.dataset,i)var l=i.dgst;return i=l,i!==""&&(s=Error(Q(419)),s.stack="",s.digest=i,Vl({value:s,source:null,stack:null})),Tu(e,t,o)}if(Ke||$a(e,t,o,!1),i=(o&e.childLanes)!==0,Ke||i){if(va.current!==null)return Tu(e,t,o);if(i=be,i!==null&&(s=wx(i,o),s!==0&&s!==r.retryLane))throw r.retryLane=s,cr(e,s),Xn(i,e,s),Vg;return ig(a)||Eh(),Tu(e,t,o)}return ig(a)?(t.flags|=192,t.child=e.child,null):(e=r.treeContext,Ne=Mi(a.nextSibling),cn=t,Zt=!0,oa=null,Si=!1,e!==null&&sS(t,e),t=Gg(t,s.children),t.flags|=134221824,t)}function Ty(e,t,n){e.lanes|=t;var i=e.alternate;i!==null&&(i.lanes|=t),Hu(e.return,t,n)}function Ay(e){for(var t=null;e!==null;){var n=e.alternate;n!==null&&fh(n)===null&&(t=e),e=e.sibling}return t}function Au(e,t,n,i,s,a){var r=e.memoizedState;r===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:i,tail:n,tailMode:s,treeForkCount:a}:(r.isBackwards=t,r.rendering=null,r.renderingStartTime=0,r.last=i,r.tail=n,r.tailMode=s,r.treeForkCount=a)}function zp(e){var t=e.child;for(e.child=null;t!==null;){var n=t.sibling;t.sibling=e.child,e.child=t,t=n}}function Lm(e,t,n){var i=t.pendingProps,s=i.revealOrder,a=i.tail;i=i.children;var r=_n.current;if(t.flags&128)return kl(t,r),null;var o=(r&2)!==0;if(o?(r=r&1|2,t.flags|=128):r&=1,kl(t,r),s==="backwards"&&e!==null?(zp(e),je(e,t,i,n),zp(e)):je(e,t,i,n),i=Zt?Hl:0,!o&&e!==null&&(e.flags&128)!==0)t:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Ty(e,n,t);else if(e.tag===19)Ty(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break t;for(;e.sibling===null;){if(e.return===null||e.return===t)break t;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(s){case"backwards":n=Ay(t.child),n===null?(s=t.child,t.child=null):(s=n.sibling,n.sibling=null,zp(t)),Au(t,!0,s,null,a,i);break;case"unstable_legacy-backwards":for(n=null,s=t.child,t.child=null;s!==null;){if(e=s.alternate,e!==null&&fh(e)===null){t.child=s;break}e=s.sibling,s.sibling=n,n=s,s=e}Au(t,!0,n,null,a,i);break;case"together":Au(t,!1,null,null,void 0,i);break;case"independent":t.memoizedState=null;break;default:n=Ay(t.child),n===null?(s=t.child,t.child=null):(s=n.sibling,n.sibling=null),Au(t,!1,s,n,a,i)}return t.child}function wy(e,t,n){var i=t.pendingProps;return na(t,t.type,i.value),je(e,t,i.children,n),t.child}function Cs(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),xa|=t.lanes,(n&t.childLanes)===0)if(e!==null){if($a(e,t,n,!1),(n&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(Q(153));if(t.child!==null){for(e=t.child,n=Ms(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Ms(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function kg(e,t){return(e.lanes&t)!==0?!0:(e=e.dependencies,!!(e!==null&&ch(e)))}function RA(e,t,n){switch(t.tag){case 3:eh(t,t.stateNode.containerInfo),na(t,Je,e.memoizedState.cache),ja();break;case 27:case 5:rm(t);break;case 4:eh(t,t.stateNode.containerInfo);break;case 10:na(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,bm(t),null;break;case 13:var i=t.memoizedState;if(i!==null){if(i.dehydrated!==null)return ua(t),t.flags|=128,null;i=$a(e,t,n,!1);var s=t.child.childLanes;return i||(n&s)!==0?jS(e,t,n):(ua(t),e=Cs(e,t,n),e!==null?e.sibling:null)}ua(t);break;case 19:if(t.flags&128)return Lm(e,t,n);if(s=(e.flags&128)!==0,i=(n&t.childLanes)!==0,i||($a(e,t,n,!1),i=(n&t.childLanes)!==0),s){if(i)return Lm(e,t,n);t.flags|=128}if(s=t.memoizedState,s!==null&&(s.rendering=null,s.tail=null,s.lastEffect=null),kl(t,_n.current),i)break;return null;case 22:return t.lanes=0,QS(e,t,n,t.pendingProps);case 24:na(t,Je,e.memoizedState.cache)}return Cs(e,t,n)}function $S(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps)Ke=!0;else{if(!kg(e,n)&&(t.flags&128)===0)return Ke=!1,RA(e,t,n);Ke=(e.flags&131072)!==0}else Ke=!1,Zt&&(t.flags&1048576)!==0&&iS(t,Hl,t.index);switch(t.lanes=0,t.tag){case 16:t:{var i=t.pendingProps;if(e=ka(t.elementType),t.type=e,typeof e=="function")Sg(e)?(i=sr(e,i),t.tag=1,t=by(null,t,e,i,n)):(t.tag=0,t=Rm(null,t,e,i,n));else{if(e!=null){var s=e.$$typeof;if(s===lg){t.tag=11,t=vy(null,t,e,i,n);break t}else if(s===cg){t.tag=14,t=yy(null,t,e,i,n);break t}else if(s===Qi){t.tag=10,t.type=e,t=wy(null,t,n);break t}}throw t=sm(e)||e,Error(Q(306,t,""))}}return t;case 0:return Rm(e,t,t.type,t.pendingProps,n);case 1:return i=t.type,s=sr(i,t.pendingProps),by(e,t,i,s,n);case 3:t:{if(eh(t,t.stateNode.containerInfo),e===null)throw Error(Q(387));i=t.pendingProps;var a=t.memoizedState;s=a.element,xm(e,t),Rl(t,i,null,n);var r=t.memoizedState;if(i=r.cache,na(t,Je,i),i!==a.cache&&vm(t,[Je],n,!0),Cl(),i=r.element,a.isDehydrated)if(a={element:i,isDehydrated:!1,cache:r.cache},t.updateQueue.baseState=a,t.memoizedState=a,t.flags&256){t=Ey(e,t,i,n);break t}else if(i!==s){s=xi(Error(Q(424)),t),Vl(s),t=Ey(e,t,i,n);break t}else for(e=t.stateNode.containerInfo,e.nodeType===9?e=e.body:e=e.nodeName==="HTML"?e.ownerDocument.body:e,Ne=Mi(e.firstChild),cn=t,Zt=!0,oa=null,Si=!0,n=cS(t,null,i,n),t.child=n;n;)n.flags=n.flags&-3|134221824,n=n.sibling;else{if(ja(),i===s){t=Cs(e,t,n);break t}je(e,t,i,n)}t=t.child}return t;case 26:return Lr(e,t),e===null?(n=tx(t.type,null,t.pendingProps,null))?t.memoizedState=n:Zt||(t.stateNode=GM(t.type,t.pendingProps,ra.current,t)):t.memoizedState=tx(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return rm(t),e===null&&Zt&&(i=t.stateNode=jM(t.type,t.pendingProps,ra.current),cn=t,Si=!0,s=Ne,Ma(t.type)?(sg=s,Ne=Mi(i.firstChild)):Ne=s),je(e,t,t.pendingProps.children,n),Lr(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&Zt&&((s=i=Ne)&&(i=Sw(i,t.type,t.pendingProps,Si),i!==null?(t.stateNode=i,cn=t,Ne=Mi(i.firstChild),Si=!1,s=!0):s=!1),s||_a(t)),rm(t),s=t.type,a=t.pendingProps,r=e!==null?e.memoizedProps:null,i=a.children,tg(s,a)?i=null:r!==null&&tg(s,r)&&(t.flags|=32),t.memoizedState!==null&&(s=Ng(e,t,vA,null,null,n),mo._currentValue=s),Lr(e,t),je(e,t,i,n),t.child;case 6:return e===null&&Zt&&((e=n=Ne)&&(n=Mw(n,t.pendingProps,Si),n!==null?(t.stateNode=n,cn=t,Ne=null,e=!0):e=!1),e||_a(t)),null;case 13:return jS(e,t,n);case 4:return eh(t,t.stateNode.containerInfo),i=t.pendingProps,e===null?t.child=nr(t,null,i,n):je(e,t,i,n),t.child;case 11:return vy(e,t,t.type,t.pendingProps,n);case 7:return i=t.pendingProps,Lr(e,t),je(e,t,i,n),t.child;case 8:return je(e,t,t.pendingProps.children,n),t.child;case 12:return je(e,t,t.pendingProps.children,n),t.child;case 10:return wy(e,t,n);case 9:return s=t.type._context,i=t.pendingProps.children,tr(t),s=mn(s),i=i(s),t.flags|=1,je(e,t,i,n),t.child;case 14:return yy(e,t,t.type,t.pendingProps,n);case 15:return KS(e,t,t.type,t.pendingProps,n);case 19:return Lm(e,t,n);case 31:return wA(e,t,n);case 22:return QS(e,t,n,t.pendingProps);case 24:return tr(t),i=mn(Je),e===null?(s=Eg(),s===null&&(s=be,a=bg(),s.pooledCache=a,a.refCount++,a!==null&&(s.pooledCacheLanes|=n),s=a),t.memoizedState={parent:i,cache:s},Ag(t),na(t,Je,s)):((e.lanes&n)!==0&&(xm(e,t),Rl(t,null,null,n),Cl()),s=e.memoizedState,a=t.memoizedState,s.parent!==i?(s={parent:i,cache:i},t.memoizedState=s,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=s),na(t,Je,i)):(i=a.cache,na(t,Je,i),i!==s.cache&&vm(t,[Je],n,!0))),je(e,t,t.pendingProps.children,n),t.child;case 30:return t.stateNode===null&&(t.stateNode={autoName:null,paired:null,clones:null,ref:null}),i=t.pendingProps,i.name!=null&&i.name!=="auto"?t.flags|=e===null?18882560:18874368:Zt&&Ph(t),e!==null&&e.memoizedProps.name!==i.name?t.flags|=4194816:Lr(e,t),je(e,t,i.children,n),t.child;case 29:throw t.pendingProps}throw Error(Q(156,t.tag))}function ys(e){e.flags|=4}function Fp(e,t,n,i,s){var a;if((a=(e.mode&32)!==0)&&(a=n===null?ix(t,i):ix(t,i)&&(i.src!==n.src||i.srcSet!==n.srcSet)),a){if(e.flags|=16777216,(s&335544128)===s)if(e.stateNode.complete)e.flags|=8192;else if(CM())e.flags|=8192;else throw Ka=uh,Tg}else e.flags&=-16777217}function Cy(e,t){if(t.type!=="stylesheet"||(t.state.loading&4)!==0)e.flags&=-16777217;else if(e.flags|=16777216,!nb(t))if(CM())e.flags|=8192;else throw Ka=uh,Tg}function wu(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag!==22?Ex():536870912,e.lanes|=t,lo|=t)}function pl(e,t){if(!Zt)switch(e.tailMode){case"visible":break;case"collapsed":for(var n=e.tail,i=null;n!==null;)n.alternate!==null&&(i=n),n=n.sibling;i===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:i.sibling=null;break;default:for(t=e.tail,n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null}}function Re(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,i=0;if(t)for(var s=e.child;s!==null;)n|=s.lanes|s.childLanes,i|=s.subtreeFlags&1206910976,i|=s.flags&1206910976,s.return=e,s=s.sibling;else for(s=e.child;s!==null;)n|=s.lanes|s.childLanes,i|=s.subtreeFlags,i|=s.flags,s.return=e,s=s.sibling;return e.subtreeFlags|=i,e.childLanes=n,t}function NA(e,t,n){var i=t.pendingProps;switch(Mg(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Re(t),null;case 1:return Re(t),null;case 3:return n=t.stateNode,i=null,e!==null&&(i=e.memoizedState.cache),t.memoizedState.cache!==i&&(t.flags|=2048),bs(Je),so(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(Dr(t)?ys(t):e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,Op())),Re(t),null;case 26:var s=t.type,a=t.memoizedState;return e===null?(ys(t),a!==null?(Re(t),Cy(t,a)):(Re(t),Fp(t,s,null,i,n))):a?a!==e.memoizedState?(ys(t),Re(t),Cy(t,a)):(Re(t),t.flags&=-16777217):(e=e.memoizedProps,e!==i&&ys(t),Re(t),Fp(t,s,e,i,n)),null;case 27:if(nh(t),n=ra.current,s=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==i&&ys(t);else{if(!i){if(t.stateNode===null)throw Error(Q(166));return Re(t),t.subtreeFlags&=-33554433,null}e=es.current,Dr(t)?ey(t,e):(e=jM(s,i,n),t.stateNode=e,ys(t))}return Re(t),t.subtreeFlags&=-33554433,null;case 5:if(nh(t),s=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==i&&ys(t);else{if(!i){if(t.stateNode===null)throw Error(Q(166));return Re(t),t.subtreeFlags&=-33554433,null}if(a=es.current,Dr(t))ey(t,a);else{var r=Yl(ra.current);switch(a){case 1:a=r.createElementNS("http://www.w3.org/2000/svg",s);break;case 2:a=r.createElementNS("http://www.w3.org/1998/Math/MathML",s);break;default:switch(s){case"svg":a=r.createElementNS("http://www.w3.org/2000/svg",s);break;case"math":a=r.createElementNS("http://www.w3.org/1998/Math/MathML",s);break;case"script":a=r.createElement("div"),a.innerHTML="<script><\/script>",a=a.removeChild(a.firstChild);break;case"select":a=typeof i.is=="string"?r.createElement("select",{is:i.is}):r.createElement("select"),i.multiple?a.multiple=!0:i.size&&(a.size=i.size);break;default:a=typeof i.is=="string"?r.createElement(s,{is:i.is}):r.createElement(s)}}a[pn]=t,a[qn]=i;t:for(r=t.child;r!==null;){if(r.tag===5||r.tag===6)a.appendChild(r.stateNode);else if(r.tag!==4&&r.tag!==27&&r.child!==null){r.child.return=r,r=r.child;continue}if(r===t)break t;for(;r.sibling===null;){if(r.return===null||r.return===t)break t;r=r.return}r.sibling.return=r.return,r=r.sibling}t.stateNode=a;t:switch(vn(a,s,i),s){case"button":case"input":case"select":case"textarea":i=!!i.autoFocus;break t;case"img":i=!0;break t;default:i=!1}i&&ys(t)}}return Re(t),t.subtreeFlags&=-33554433,Fp(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==i&&ys(t);else{if(typeof i!="string"&&t.stateNode===null)throw Error(Q(166));if(e=ra.current,Dr(t)){if(e=t.stateNode,n=t.memoizedProps,i=null,s=cn,s!==null)switch(s.tag){case 27:case 5:i=s.memoizedProps}e[pn]=t,e=!!(e.nodeValue===n||i!==null&&i.suppressHydrationWarning===!0||HM(e.nodeValue,n)),e||_a(t,!0)}else e=Yl(e).createTextNode(i),e[pn]=t,t.stateNode=e}return Re(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(i=Dr(t),n!==null){if(e===null){if(!i)throw Error(Q(318));if(e=t.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(Q(557));e[pn]=t}else ja(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Re(t),e=!1}else n=Op(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(jn(t),t):(jn(t),null);if((t.flags&128)!==0)throw Error(Q(558))}return Re(t),null;case 13:if(i=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(s=Dr(t),i!==null&&i.dehydrated!==null){if(e===null){if(!s)throw Error(Q(318));if(s=t.memoizedState,s=s!==null?s.dehydrated:null,!s)throw Error(Q(317));s[pn]=t}else ja(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Re(t),s=!1}else s=Op(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=s),s=!0;if(!s)return t.flags&256?(jn(t),t):(jn(t),null)}return jn(t),(t.flags&128)!==0?(t.lanes=n,t):(n=i!==null,e=e!==null&&e.memoizedState!==null,n&&(i=t.child,s=null,i.alternate!==null&&i.alternate.memoizedState!==null&&i.alternate.memoizedState.cachePool!==null&&(s=i.alternate.memoizedState.cachePool.pool),a=null,i.memoizedState!==null&&i.memoizedState.cachePool!==null&&(a=i.memoizedState.cachePool.pool),a!==s&&(i.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),wu(t,t.updateQueue),Re(t),null);case 4:return so(),e===null&&jg(t.stateNode.containerInfo),t.flags|=67108864,Re(t),null;case 10:return bs(t.type),Re(t),null;case 19:if(Cg(t),i=t.memoizedState,i===null)return Re(t),null;if(s=(t.flags&128)!==0,a=i.rendering,a===null)if(s)pl(i,!1);else{if(Ve!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(a=fh(e),a!==null){for(t.flags|=128,pl(i,!1),e=a.updateQueue,t.updateQueue=e,wu(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)eS(n,e),n=n.sibling;return kl(t,_n.current&1|2),Zt&&xs(t,i.treeForkCount),t.child}e=e.sibling}i.tail!==null&&ei()>Mh&&(t.flags|=128,s=!0,pl(i,!1),t.lanes=4194304)}else{if(!s)if(e=fh(a),e!==null){if(t.flags|=128,s=!0,e=e.updateQueue,t.updateQueue=e,wu(t,e),pl(i,!0),i.tail===null&&i.tailMode!=="collapsed"&&i.tailMode!=="visible"&&!a.alternate&&!Zt)return Re(t),null}else 2*ei()-i.renderingStartTime>Mh&&n!==536870912&&(t.flags|=128,s=!0,pl(i,!1),t.lanes=4194304);i.isBackwards?(a.sibling=t.child,t.child=a):(e=i.last,e!==null?e.sibling=a:t.child=a,i.last=a)}if(i.tail!==null){e=i.tail;t:{for(n=e;n!==null;){if(n.alternate!==null){n=!1;break t}n=n.sibling}n=!0}return i.rendering=e,i.tail=e.sibling,i.renderingStartTime=ei(),e.sibling=null,a=_n.current,a=s?a&1|2:a&1,i.tailMode==="visible"||i.tailMode==="collapsed"||!n||Zt?kl(t,a):(n=a,De(yn,t),De(_n,n),wn===null&&(wn=t)),Zt&&xs(t,i.treeForkCount),e}return Re(t),null;case 22:case 23:return jn(t),wg(),i=t.memoizedState!==null,e!==null?e.memoizedState!==null!==i&&(t.flags|=8192):i&&(t.flags|=8192),i?(n&536870912)!==0&&(t.flags&128)===0&&(Re(t),t.subtreeFlags&6&&(t.flags|=8192)):Re(t),n=t.updateQueue,n!==null&&wu(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),i=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(i=t.memoizedState.cachePool.pool),i!==n&&(t.flags|=2048),e!==null&&gn(Ja),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),bs(Je),Re(t),null;case 25:return null;case 30:return t.flags|=33554432,Re(t),null}throw Error(Q(156,t.tag))}function DA(e,t){switch(Mg(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return bs(Je),so(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return nh(t),null;case 31:if(t.memoizedState!==null){if(jn(t),t.alternate===null)throw Error(Q(340));ja()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(jn(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(Q(340));ja()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return Cg(t),e=t.flags,e&65536?(t.flags=e&-65537|128,e=t.memoizedState,e!==null&&(e.rendering=null,e.tail=null),t.flags|=4,t):null;case 4:return so(),null;case 10:return bs(t.type),null;case 22:case 23:return jn(t),wg(),e!==null&&gn(Ja),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return bs(Je),null;case 25:return null;default:return null}}function tM(e,t){switch(Mg(t),t.tag){case 3:bs(Je),so();break;case 26:case 27:case 5:nh(t);break;case 4:so();break;case 31:t.memoizedState!==null&&jn(t);break;case 13:jn(t);break;case 19:Cg(t);break;case 10:bs(t.type);break;case 22:case 23:jn(t),wg(),e!==null&&gn(Ja);break;case 24:bs(Je)}}function rc(e,t){try{var n=t.updateQueue,i=n!==null?n.lastEffect:null;if(i!==null){var s=i.next;n=s;do{if((n.tag&e)===e){i=void 0;var a=n.create,r=n.inst;i=a(),r.destroy=i}n=n.next}while(n!==s)}}catch(o){ge(t,t.return,o)}}function ya(e,t,n){try{var i=t.updateQueue,s=i!==null?i.lastEffect:null;if(s!==null){var a=s.next;i=a;do{if((i.tag&e)===e){var r=i.inst,o=r.destroy;if(o!==void 0){r.destroy=void 0,s=t;var l=n,c=o;try{c()}catch(f){ge(s,l,f)}}}i=i.next}while(i!==a)}}catch(f){ge(t,t.return,f)}}function eM(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{hS(t,n)}catch(i){ge(e,e.return,i)}}}function nM(e,t,n){n.props=sr(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(i){ge(e,t,i)}}function Ji(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var i=e.stateNode;break;case 30:var s=e.stateNode,a=Ts(e.memoizedProps,s);(s.ref===null||s.ref.name!==a)&&(s.ref=qM(a)),i=s.ref;break;case 7:if(e.stateNode===null){var r=new ri(e);Wn(e.child,!1,yw,r,void 0,void 0),e.stateNode=r}i=e.stateNode;break;default:i=e.stateNode}typeof n=="function"?e.refCleanup=n(i):n.current=i}}catch(o){ge(e,t,o)}}function dn(e,t){var n=e.ref,i=e.refCleanup;if(n!==null)if(typeof i=="function")try{i()}catch(s){ge(e,t,s)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n=="function")try{n(null)}catch(s){ge(e,t,s)}else n.current=null}function _h(e,t){if((e.tag===5||e.tag===27||e.tag===6)&&e.alternate===null&&t!==null)for(var n=0;n<t.length;n++)KM(e.stateNode,t[n])}function Ry(e){for(var t=e.return;t!==null&&(Wg(t)&&KM(e.stateNode,t.stateNode),!Xg(t));)t=t.return}function Ul(e){for(var t=e.return;t!==null&&(Wg(t)&&xw(e.stateNode,t.stateNode),!Xg(t));)t=t.return}function Xg(e){return e.tag===5||e.tag===3||e.tag===27}function Wg(e){return e&&e.tag===7&&e.stateNode!==null}function Om(e){var t=e.type,n=e.memoizedProps,i=e.stateNode;try{t:switch(t){case"button":case"input":case"select":case"textarea":n.autoFocus&&i.focus();break t;case"img":n.src?i.src=n.src:n.srcSet&&(i.srcset=n.srcSet)}}catch(s){ge(e,e.return,s)}}function Hp(e,t,n){try{var i=e.stateNode;ew(i,e.type,n,t),i[qn]=t}catch(s){ge(e,e.return,s)}}function iM(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&Ma(e.type)||e.tag===4}function Vp(e){t:for(;;){for(;e.sibling===null;){if(e.return===null||iM(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&Ma(e.type)||e.flags&2||e.child===null||e.tag===4)continue t;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Im(e,t,n,i){var s=e.tag;if(s===5||s===6)s=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n).insertBefore(s,t):(t=n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n,t.appendChild(s),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=ji)),_h(e,i),re=!0;else if(s!==4&&(s===27&&(_h(e,i),i=null,Ma(e.type)&&(n=e.stateNode,t=null)),e=e.child,e!==null))for(Im(e,t,n,i),e=e.sibling;e!==null;)Im(e,t,n,i),e=e.sibling}function vh(e,t,n,i){var s=e.tag;if(s===5||s===6)s=e.stateNode,t?n.insertBefore(s,t):n.appendChild(s),_h(e,i),re=!0;else if(s!==4&&(s===27&&(_h(e,i),i=null,Ma(e.type)&&(n=e.stateNode)),e=e.child,e!==null))for(vh(e,t,n,i),e=e.sibling;e!==null;)vh(e,t,n,i),e=e.sibling}function sM(e){var t=e.stateNode,n=e.memoizedProps;try{for(var i=e.type,s=t.attributes;s.length;)t.removeAttributeNode(s[0]);vn(t,i,n),t[pn]=e,t[qn]=n}catch(a){ge(e,e.return,a)}}var yh=!1,$n=null;function Ny(e){(e.tag===30||(e.subtreeFlags&33554432)!==0)&&(yh=!0)}var Ki=null;function Dy(){var e=Ki;return Ki=null,e}var Gn=0;function So(e,t,n,i,s){return Gn=0,aM(e.child,t,n,i,s)}function aM(e,t,n,i,s){for(var a=!1;e!==null;){if(e.tag===5){var r=e.stateNode;if(i!==null){var o=eg(r);i.push(o),o.view&&(a=!0)}else a||eg(r).view&&(a=!0);yh=!0,kM(r,Gn===0?t:t+"_"+Gn,n),Gn++}else(e.tag!==22||e.memoizedState===null)&&(e.tag===30&&s||aM(e.child,t,n,i,s)&&(a=!0));e=e.sibling}return a}function is(e,t){for(;e!==null;)e.tag===5?XM(e.stateNode,e.memoizedProps):(e.tag!==22||e.memoizedState===null)&&(e.tag===30&&t||is(e.child,t)),e=e.sibling}function Wu(e){if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if((e.tag!==22||e.memoizedState===null)&&(Wu(e),e.tag===30&&(e.flags&18874368)!==0&&e.stateNode.paired)){var t=e.memoizedProps;if(t.name==null||t.name==="auto")throw Error(Q(544));var n=t.name;t=Ds(t.default,t.share),t!=="none"&&(So(e,n,t,null,!1)||is(e.child,!1))}e=e.sibling}}function Pm(e,t){if(e.tag===30){var n=e.stateNode,i=e.memoizedProps,s=Ts(i,n),a=Ds(i.default,n.paired?i.share:i.enter);a!=="none"?So(e,s,a,null,!1)?(Wu(e),n.paired||t||co(e,i.onEnter)):is(e.child,!1):Wu(e)}else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)Pm(e,t),e=e.sibling;else Wu(e)}function Bm(e){if($n!==null&&$n.size!==0){var t=$n;if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&(e.flags&18874368)!==0){var n=e.memoizedProps,i=n.name;if(i!=null&&i!=="auto"){var s=t.get(i);if(s!==void 0){var a=Ds(n.default,n.share);if(a!=="none"&&(So(e,i,a,null,!1)?(a=e.stateNode,s.paired=a,a.paired=s,co(e,n.onShare)):is(e.child,!1)),t.delete(i),t.size===0)break}}}Bm(e)}e=e.sibling}}}function zm(e){if(e.tag===30){var t=e.memoizedProps,n=Ts(t,e.stateNode),i=$n!==null?$n.get(n):void 0,s=Ds(t.default,i!==void 0?t.share:t.exit);s!=="none"&&(So(e,n,s,null,!1)?i!==void 0?(s=e.stateNode,i.paired=s,s.paired=i,$n.delete(n),co(e,t.onShare)):co(e,t.onExit):is(e.child,!1)),$n!==null&&Bm(e)}else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)zm(e),e=e.sibling;else $n!==null&&Bm(e)}function rM(e){for(e=e.child;e!==null;){if(e.tag===30){var t=e.memoizedProps,n=Ts(t,e.stateNode);t=Ds(t.default,t.update),e.flags&=-5,t!=="none"&&So(e,n,t,e.memoizedState=[],!1)}else(e.subtreeFlags&33554432)!==0&&rM(e);e=e.sibling}}function Fm(e){if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&(e.flags&18874368)!==0){var t=e.stateNode;t.paired!==null&&(t.paired=null,is(e.child,!1))}Fm(e)}e=e.sibling}}function qu(e){if(e.tag===30)e.stateNode.paired=null,is(e.child,!1),Fm(e);else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)qu(e),e=e.sibling;else Fm(e)}function oM(e){for(e=e.child;e!==null;)e.tag===30?is(e.child,!1):(e.subtreeFlags&33554432)!==0&&oM(e),e=e.sibling}function qg(e,t,n,i,s,a,r){for(var o=!1;t!==null;){if(t.tag===5){var l=t.stateNode;if(a!==null&&Gn<a.length){var c=a[Gn],f=eg(l);(c.view||f.view)&&(o=!0);var p;if(p=(e.flags&4)===0)if(f.clip)p=!0;else{p=c.rect;var u=f.rect;p=p.y!==u.y||p.x!==u.x||p.height!==u.height||p.width!==u.width}p&&(e.flags|=4),f.abs?f=!c.abs:(c=c.rect,f=f.rect,f=c.height!==f.height||c.width!==f.width),f&&(e.flags|=32)}else e.flags|=32;(e.flags&4)!==0&&kM(l,Gn===0?n:n+"_"+Gn,s),o&&(e.flags&4)!==0||(Ki===null&&(Ki=[]),Ki.push(l,Gn===0?i:i+"_"+Gn,t.memoizedProps)),Gn++}else(t.tag!==22||t.memoizedState===null)&&(t.tag===30&&r?e.flags|=t.flags&32:qg(e,t.child,n,i,s,a,r)&&(o=!0));t=t.sibling}return o}function lM(e,t){for(e=e.child;e!==null;){if(e.tag===30){var n=e.memoizedProps,i=e.stateNode,s=Ts(n,i),a=Ds(n.default,n.update);if(t){i=i.clones;var r=i===null?null:i.map(ow)}else r=e.memoizedState,e.memoizedState=null;i=e;var o=e.child;Gn=0,s=qg(i,o,s,s,a,r,!1),(e.flags&4)!==0&&s&&(t||co(e,n.onUpdate))}else(e.subtreeFlags&33554432)!==0&&lM(e,t);e=e.sibling}}var rn=!1,fe=!1,qi=!1,Gp=!1,Uy=typeof WeakSet=="function"?WeakSet:Set,on=null,Yi=!1,Ml=!1,xh=!1,Hm=!1;function UA(e,t,n){if(e=e.containerInfo,jm=go,e=Yx(e),vg(e)){if("selectionStart"in e)var i={start:e.selectionStart,end:e.selectionEnd};else t:{i=(i=e.ownerDocument)&&i.defaultView||window;var s=i.getSelection&&i.getSelection();if(s&&s.rangeCount!==0){i=s.anchorNode;var a=s.anchorOffset,r=s.focusNode;s=s.focusOffset;try{i.nodeType,r.nodeType}catch{i=null;break t}var o=0,l=-1,c=-1,f=0,p=0,u=e,d=null;e:for(;;){for(var v;u!==i||a!==0&&u.nodeType!==3||(l=o+a),u!==r||s!==0&&u.nodeType!==3||(c=o+s),u.nodeType===3&&(o+=u.nodeValue.length),(v=u.firstChild)!==null;)d=u,u=v;for(;;){if(u===e)break e;if(d===i&&++f===a&&(l=o),d===r&&++p===s&&(c=o),(v=u.nextSibling)!==null)break;u=d,d=u.parentNode}u=v}i=l===-1||c===-1?null:{start:l,end:c}}else i=null}i=i||{start:0,end:0}}else i=null;for($m={focusedElem:e,selectionRange:i},go=!1,n=(n&335544064)===n,on=t,t=n?9270:1024;on!==null;){if(e=on,n&&(i=e.deletions,i!==null))for(a=0;a<i.length;a++)n&&zm(i[a]);if(e.alternate===null&&(e.flags&2)!==0)n&&Ny(e),Cu(n);else{if(e.tag===22){if(i=e.alternate,e.memoizedState!==null){i!==null&&i.memoizedState===null&&n&&zm(i),Cu(n);continue}else if(i!==null&&i.memoizedState!==null){n&&Ny(e),Cu(n);continue}}i=e.child,(e.subtreeFlags&t)!==0&&i!==null?(i.return=e,on=i):(n&&rM(e),Cu(n))}}$n=null}function Cu(e){for(;on!==null;){var t=on,n=e,i=t.alternate,s=t.flags;switch(t.tag){case 0:case 11:case 15:break;case 1:if((s&1024)!==0&&i!==null){n=void 0,s=i.memoizedProps,i=i.memoizedState;var a=t.stateNode;try{var r=sr(t.type,s);n=a.getSnapshotBeforeUpdate(r,i),a.__reactInternalSnapshotBeforeUpdate=n}catch(o){ge(t,t.return,o)}}break;case 3:if((s&1024)!==0){if(i=t.stateNode.containerInfo,n=i.nodeType,n===9)ng(i);else if(n===1)switch(i.nodeName){case"HEAD":case"HTML":case"BODY":ng(i);break;default:i.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;case 30:n&&i!==null&&(n=Ts(i.memoizedProps,i.stateNode),s=t.memoizedProps,s=Ds(s.default,s.update),s!=="none"&&So(i,n,s,i.memoizedState=[],!0));break;default:if((s&1024)!==0)throw Error(Q(163))}if(i=t.sibling,i!==null){i.return=t.return,on=i;break}on=t.return}}function cM(e,t,n){var i=n.flags;switch(n.tag){case 0:case 11:case 15:Zi(e,n),i&4&&rc(5,n);break;case 1:if(Zi(e,n),i&4)if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(r){ge(n,n.return,r)}else{var s=sr(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(s,t,e.__reactInternalSnapshotBeforeUpdate)}catch(r){ge(n,n.return,r)}}i&64&&eM(n),i&512&&Ji(n,n.return);break;case 3:if(Zi(e,n),i&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{hS(e,t)}catch(r){ge(n,n.return,r)}}break;case 27:t===null&&i&4&&sM(n);case 26:case 5:Zi(e,n),t===null&&i&4&&Om(n),i&512&&Ji(n,n.return);break;case 12:Zi(e,n);break;case 31:Zi(e,n),i&4&&dM(e,n);break;case 13:Zi(e,n),i&4&&pM(e,n),i&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=XA.bind(null,n),bw(e,n))));break;case 22:if(i=n.memoizedState!==null||rn,!i){var a=t!==null&&t.memoizedState!==null||fe;t=rn,s=fe,rn=i,(fe=a)&&!s?(i=2,(n.subtreeFlags&8772)!==0&&(i|=1),Ci(e,n,i)):Zi(e,n),rn=t,fe=s}break;case 30:Zi(e,n),i&512&&Ji(n,n.return);break;case 7:i&512&&Ji(n,n.return);default:Zi(e,n)}}function Vm(e,t){for(e=e.child;e!==null;)uM(e,t),e=e.sibling}function uM(e,t){switch(e.tag){case 5:case 26:try{var n=e.stateNode;if(t){var i=n.style;typeof i.setProperty=="function"?i.setProperty("display","none","important"):i.display="none"}else{var s=e.stateNode,a=e.memoizedProps.style,r=a!=null&&a.hasOwnProperty("display")?a.display:null;s.style.display=r==null||typeof r=="boolean"?"":(""+r).trim()}}catch(l){ge(e,e.return,l)}Gm(e,t);break;case 6:try{e.stateNode.nodeValue=t?"":e.memoizedProps,re=!0}catch(l){ge(e,e.return,l)}break;case 18:try{var o=e.stateNode;t?Zy(o,!0):Zy(e.stateNode,!1)}catch(l){ge(e,e.return,l)}break;case 22:case 23:e.memoizedState===null&&Vm(e,t);break;default:Vm(e,t)}}function Gm(e,t){if(e.subtreeFlags&67108864)for(e=e.child;e!==null;){t:{var n=e,i=t;switch(n.tag){case 4:uM(n,i);break t;case 22:n.memoizedState===null&&Gm(n,i);break t;default:Gm(n,i)}}e=e.sibling}}function hM(e){var t=e.alternate;t!==null&&(e.alternate=null,hM(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&Nh(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var Be=null,Hn=!1;function wi(e,t,n){for(n=n.child;n!==null;)fM(e,t,n),n=n.sibling}function fM(e,t,n){if(ni&&typeof ni.onCommitFiberUnmount=="function")try{ni.onCommitFiberUnmount($l,n)}catch{}switch(n.tag){case 26:fe||dn(n,t),wi(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&!fe&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:fe||dn(n,t),Ul(n);var i=Be,s=Hn;Ma(n.type)&&(Be=n.stateNode,Hn=!1),wi(e,t,n),$M(n.stateNode,n.type,n.memoizedProps),Be=i,Hn=s;break;case 5:fe||dn(n,t),Ul(n);case 6:if(n.tag===6&&Ul(n),i=Be,s=Hn,Be=null,wi(e,t,n),Be=i,Hn=s,Be!==null)if(Hn)try{(Be.nodeType===9?Be.body:Be.nodeName==="HTML"?Be.ownerDocument.body:Be).removeChild(n.stateNode),re=!0}catch(a){ge(n,t,a)}else try{Be.removeChild(n.stateNode),re=!0}catch(a){ge(n,t,a)}break;case 18:Be!==null&&(Hn?(e=Be,Yy(e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,n.stateNode),_o(e)):Yy(Be,n.stateNode));break;case 4:i=Be,s=Hn,Be=n.stateNode.containerInfo,Hn=!0,wi(e,t,n),Be=i,Hn=s;break;case 0:case 11:case 14:case 15:ya(2,n,t),fe||ya(4,n,t),wi(e,t,n);break;case 1:fe||(dn(n,t),i=n.stateNode,typeof i.componentWillUnmount=="function"&&nM(n,t,i)),wi(e,t,n);break;case 21:wi(e,t,n);break;case 22:fe=(i=fe)||n.memoizedState!==null,wi(e,t,n),fe=i;break;case 30:dn(n,t),wi(e,t,n);break;case 7:fe||dn(n,t),wi(e,t,n);break;default:wi(e,t,n)}}function dM(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{_o(e)}catch(n){ge(t,t.return,n)}}}function pM(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{_o(e)}catch(n){ge(t,t.return,n)}}function LA(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new Uy),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new Uy),t;default:throw Error(Q(435,e.tag))}}function Ru(e,t){var n=LA(e);t.forEach(function(i){if(!n.has(i)){n.add(i);var s=WA.bind(null,e,i);i.then(s,s)}})}function Ln(e,t,n){var i=t.deletions;if(i!==null)for(var s=0;s<i.length;s++){var a=i[s],r=e,o=t,l=o;t:for(;l!==null;){switch(l.tag){case 27:if(Ma(l.type)){Be=l.stateNode,Hn=!1;break t}break;case 5:Be=l.stateNode,Hn=!1;break t;case 3:case 4:Be=l.stateNode.containerInfo,Hn=!0;break t}l=l.return}if(Be===null)throw Error(Q(160));fM(r,o,a),Be=null,Hn=!1,r=a.alternate,r!==null&&(r.return=null),a.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)mM(t,e,n),t=t.sibling}var Ri=null;function mM(e,t,n){var i=e.alternate,s=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(s&4&&(i=e.updateQueue,i=i!==null?i.events:null,i!==null))for(var a=0;a<i.length;a++){var r=i[a];r.ref.impl=r.nextImpl}Ln(t,e,n),On(e),s&4&&(ya(3,e,e.return),rc(3,e),ya(5,e,e.return));break;case 1:Ln(t,e,n),On(e),s&512&&(fe||i===null||dn(i,i.return)),s&64&&rn&&(e=e.updateQueue,e!==null&&(t=e.callbacks,t!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?t:n.concat(t))));break;case 26:if(a=Ri,Ln(t,e,n),On(e),s&512&&(fe||i===null||dn(i,i.return)),s&4)if(s=i!==null?i.memoizedState:null,n=e.memoizedState,i===null)if(n===null)if(e.stateNode===null)if(rn)e.stateNode=GM(e.type,e.memoizedProps,t.containerInfo,e);else{t:{t=e.type,n=e.memoizedProps,s=a.ownerDocument||a;e:switch(t){case"title":i=s.getElementsByTagName("title")[0],(!i||i[nc]||i[pn]||i.namespaceURI==="http://www.w3.org/2000/svg"||i.hasAttribute("itemprop"))&&(i=s.createElement(t),s.head.insertBefore(i,s.querySelector("head > title"))),vn(i,t,n),i[pn]=e,ln(i),t=i;break t;case"link":if(a=nx("link","href",s).get(t+(n.href||""))){for(r=0;r<a.length;r++)if(i=a[r],i.getAttribute("href")===(n.href==null||n.href===""?null:n.href)&&i.getAttribute("rel")===(n.rel==null?null:n.rel)&&i.getAttribute("title")===(n.title==null?null:n.title)&&i.getAttribute("crossorigin")===(n.crossOrigin==null?null:n.crossOrigin)){a.splice(r,1);break e}}i=s.createElement(t),vn(i,t,n),s.head.appendChild(i);break;case"meta":if(a=nx("meta","content",s).get(t+(n.content||""))){for(r=0;r<a.length;r++)if(i=a[r],i.getAttribute("content")===(n.content==null?null:""+n.content)&&i.getAttribute("name")===(n.name==null?null:n.name)&&i.getAttribute("property")===(n.property==null?null:n.property)&&i.getAttribute("http-equiv")===(n.httpEquiv==null?null:n.httpEquiv)&&i.getAttribute("charset")===(n.charSet==null?null:n.charSet)){a.splice(r,1);break e}}i=s.createElement(t),vn(i,t,n),s.head.appendChild(i);break;default:throw Error(Q(468,t))}i[pn]=e,ln(i),t=i}e.stateNode=t}else rn||ag(a,e.type,e.stateNode);else e.stateNode=ex(a,n,e.memoizedProps);else s!==n?(s===null?(t=i.stateNode,t===null||fe||t.parentNode.removeChild(t)):s.count--,n===null?rn||ag(a,e.type,e.stateNode):ex(a,n,e.memoizedProps)):n===null&&e.stateNode!==null&&Hp(e,e.memoizedProps,i.memoizedProps);break;case 27:Ln(t,e,n),On(e),s&512&&(fe||i===null||dn(i,i.return)),i!==null&&s&4&&Hp(e,e.memoizedProps,i.memoizedProps);break;case 5:if(a=qi,qi=!1,Ln(t,e,n),qi=a,On(e),s&512&&(fe||i===null||dn(i,i.return)),e.flags&32){t=e.stateNode;try{ro(t,""),re=!0}catch(f){ge(e,e.return,f)}}s&4&&e.stateNode!=null&&(t=e.memoizedProps,Hp(e,t,i!==null?i.memoizedProps:t)),s&1024&&(Gp=!0);break;case 6:if(Ln(t,e,n),On(e),s&4){if(e.stateNode===null)throw Error(Q(162));t=e.memoizedProps,n=e.stateNode;try{n.nodeValue=t,re=!0}catch(f){ge(e,e.return,f)}}break;case 3:if(re=!1,Ku=null,a=Ri,Ri=Zl(t.containerInfo),Ln(t,e,n),Ri=a,On(e),s&4&&i!==null&&i.memoizedState.isDehydrated)try{_o(t.containerInfo)}catch(f){ge(e,e.return,f)}Gp&&(Gp=!1,gM(e)),re=!1;break;case 4:s=qi,qi=rn,i=zv(),a=Ri,Ri=Zl(e.stateNode.containerInfo),Ln(t,e,n),On(e),Ri=a,re&&Ml&&(xh=!0),re=i,qi=s;break;case 12:Ln(t,e,n),On(e);break;case 31:Ln(t,e,n),On(e),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Ru(e,t)));break;case 13:Ln(t,e,n),On(e),e.child.flags&8192&&e.memoizedState!==null!=(i!==null&&i.memoizedState!==null)&&(kh=ei()),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Ru(e,t)));break;case 22:a=e.memoizedState!==null,r=i!==null&&i.memoizedState!==null;var o=rn,l=fe,c=qi;rn=o||a,qi=c||a,fe=l||r,Ln(t,e,n),fe=l,qi=c,rn=o,On(e),s&8192&&(t=e.stateNode,t._visibility=a?t._visibility&-2:t._visibility|1,!a||i===null||r||rn||fe||(t=r||fe,n=rn,i=fe,rn=a||rn,fe=t,Ks(e,2),rn=n,fe=i),!a&&qi||Vm(e,a)),s&4&&(t=e.updateQueue,t!==null&&(n=t.retryQueue,n!==null&&(t.retryQueue=null,Ru(e,n))));break;case 19:Ln(t,e,n),On(e),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Ru(e,t)));break;case 30:s&512&&(fe||i===null||dn(i,i.return)),s=zv(),a=Ml,r=(n&335544064)===n,o=e.memoizedProps,Ml=r&&Ds(o.default,o.update)!=="none",Ln(t,e,n),On(e),r&&i!==null&&re&&(e.flags|=4),Ml=a,re=s;break;case 21:break;case 7:s&512&&(fe||i===null||dn(i,i.return)),i&&i.stateNode!==null&&(i.stateNode._fragmentFiber=e);default:Ln(t,e,n),On(e)}}function On(e){var t=e.flags;if(t&2){try{for(var n,i=e.return;i!==null;){if(iM(i)){n=i;break}i=i.return}i=null;for(var s=e.return;s!==null;){if(Wg(s)){var a=s.stateNode;i===null?i=[a]:i.push(a)}if(Xg(s))break;s=s.return}var r=i;if(n==null)throw Error(Q(160));switch(n.tag){case 27:var o=n.stateNode,l=Vp(e);vh(e,l,o,r);break;case 5:var c=n.stateNode;n.flags&32&&(ro(c,""),n.flags&=-33);var f=Vp(e);vh(e,f,c,r);break;case 3:case 4:var p=n.stateNode.containerInfo,u=Vp(e);Im(e,u,p,r);break;default:throw Error(Q(161))}}catch(d){ge(e,e.return,d)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function gM(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;gM(t),t.tag===5&&t.flags&1024&&(t=t.stateNode,go=!0,t.reset(),go=!1),e=e.sibling}}function Ur(e,t){if(t.subtreeFlags&9270)for(t=t.child;t!==null;)_M(t,e),t=t.sibling;else lM(t,!1)}function _M(e,t){var n=e.alternate;if(n===null)Pm(e,!1);else switch(e.tag){case 3:if(Hm=Yi=!1,Dy(),Ur(t,e),!Yi&&!xh){if(e=Ki,e!==null)for(var i=0;i<e.length;i+=3){n=e[i];var s=e[i+1];XM(n,e[i+2]),n=n.ownerDocument.documentElement,n!==null&&n.animate({opacity:[0,0],pointerEvents:["none","none"]},{duration:0,fill:"forwards",pseudoElement:"::view-transition-group("+s+")"})}e=t.containerInfo,e=e.nodeType===9?e.documentElement:e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName===""&&(e.style.viewTransitionName="none",e.animate({opacity:[0,0],pointerEvents:["none","none"]},{duration:0,fill:"forwards",pseudoElement:"::view-transition-group(root)"}),e.animate({width:[0,0],height:[0,0]},{duration:0,fill:"forwards",pseudoElement:"::view-transition"})),Hm=!0}Ki=null;break;case 5:Ur(t,e);break;case 4:i=Yi,Yi=!1,Ur(t,e),Yi&&(xh=!0),Yi=i;break;case 22:e.memoizedState===null&&(n.memoizedState!==null?Pm(e,!1):Ur(t,e));break;case 30:i=Yi,s=Dy(),Yi=!1,Ur(t,e),Yi&&(e.flags|=4);var a=e.memoizedProps,r=e.stateNode;t=Ts(a,r),r=Ts(n.memoizedProps,r);var o=Ds(a.default,a.update);o==="none"?t=!1:(a=n.memoizedState,n.memoizedState=null,n=e.child,Gn=0,t=qg(e,n,t,r,o,a,!0),Gn!==(a===null?0:a.length)&&(e.flags|=32)),(e.flags&4)!==0&&t?(co(e,e.memoizedProps.onUpdate),Ki=s):s!==null&&(s.push.apply(s,Ki),Ki=s),Yi=(e.flags&32)!==0?!0:i;break;default:Ur(t,e)}}function Zi(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)cM(e,t.alternate,t),t=t.sibling}function Ks(e,t){for(e=e.child;e!==null;){var n=e,i=t;switch(n.tag){case 0:case 11:case 14:case 15:ya(4,n,n.return),Ks(n,i);break;case 1:dn(n,n.return);var s=n.stateNode;typeof s.componentWillUnmount=="function"&&nM(n,n.return,s),Ks(n,i);break;case 27:(i&2)!==0&&$M(n.stateNode,n.type,n.memoizedProps);case 5:dn(n,n.return),n.tag!==5&&n.tag!==27||Ul(n),Ks(n,i);break;case 6:Ul(n);break;case 26:dn(n,n.return),s=n.stateNode,n.memoizedState!==null||s===null||fe||s.parentNode.removeChild(s),Ks(n,i);break;case 22:n.memoizedState===null&&Ks(n,i);break;case 30:dn(n,n.return),Ks(n,i);break;case 7:dn(n,n.return);default:Ks(n,i)}e=e.sibling}}function Ci(e,t,n){for(n=(t.subtreeFlags&8772)!==0?n:n&-2,t=t.child;t!==null;){var i=t.alternate,s=e,a=t,r=a.flags,o=(n&1)!==0;switch(a.tag){case 0:case 11:case 15:Ci(s,a,n),rc(4,a);break;case 1:if(Ci(s,a,n),i=a,s=i.stateNode,typeof s.componentDidMount=="function")try{s.componentDidMount()}catch(f){ge(i,i.return,f)}if(i=a,s=i.updateQueue,s!==null){var l=i.stateNode;try{var c=s.shared.hiddenCallbacks;if(c!==null)for(s.shared.hiddenCallbacks=null,s=0;s<c.length;s++)uS(c[s],l)}catch(f){ge(i,i.return,f)}}o&&r&64&&eM(a),Ji(a,a.return);break;case 27:(n&2)!==0&&sM(a);case 5:a.tag!==5&&a.tag!==27||Ry(a),Ci(s,a,n),o&&i===null&&r&4&&Om(a),Ji(a,a.return);break;case 6:Ry(a);break;case 26:l=a.stateNode,a.memoizedState!==null||l===null||rn||ag(Zl(l.ownerDocument),a.type,l),Ci(s,a,n),o&&i===null&&r&4&&Om(a),Ji(a,a.return);break;case 12:Ci(s,a,n);break;case 31:Ci(s,a,n),o&&r&4&&dM(s,a);break;case 13:Ci(s,a,n),o&&r&4&&pM(s,a);break;case 22:a.memoizedState===null&&Ci(s,a,n),Ji(a,a.return);break;case 30:Ci(s,a,n),Ji(a,a.return);break;case 7:Ji(a,a.return);default:Ci(s,a,n)}t=t.sibling}}function Yg(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&sc(n))}function Zg(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&sc(e))}function mi(e,t,n,i){var s=(n&335544064)===n;if(t.subtreeFlags&(s?10262:10256))for(t=t.child;t!==null;)vM(e,t,n,i),t=t.sibling;else s&&oM(t)}function vM(e,t,n,i){var s=(n&335544064)===n;s&&t.alternate===null&&t.return!==null&&t.return.alternate!==null&&qu(t);var a=t.flags;switch(t.tag){case 0:case 11:case 15:mi(e,t,n,i),a&2048&&rc(9,t);break;case 1:mi(e,t,n,i);break;case 3:mi(e,t,n,i),s&&Hm&&(e=e.containerInfo,e=e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,e.style.viewTransitionName==="root"&&(e.style.viewTransitionName=""),e=e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName==="none"&&(e.style.viewTransitionName="")),a&2048&&(a=null,t.alternate!==null&&(a=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==a&&(t.refCount++,a!=null&&sc(a)));break;case 12:if(a&2048){mi(e,t,n,i),a=t.stateNode;try{var r=t.memoizedProps,o=r.id,l=r.onPostCommit;typeof l=="function"&&l(o,t.alternate===null?"mount":"update",a.passiveEffectDuration,-0)}catch(c){ge(t,t.return,c)}}else mi(e,t,n,i);break;case 31:mi(e,t,n,i);break;case 13:mi(e,t,n,i);break;case 23:break;case 22:r=t.stateNode,o=t.alternate,t.memoizedState!==null?(s&&o!==null&&o.memoizedState===null&&qu(o),r._visibility&2?mi(e,t,n,i):Ll(e,t)):(s&&o!==null&&o.memoizedState!==null&&qu(t),r._visibility&2?mi(e,t,n,i):(r._visibility|=2,Or(e,t,n,i,(t.subtreeFlags&10256)!==0||!1))),a&2048&&Yg(o,t);break;case 24:mi(e,t,n,i),a&2048&&Zg(t.alternate,t);break;case 30:s&&(a=t.alternate,a!==null&&(is(a.child,!0),is(t.child,!0))),mi(e,t,n,i);break;default:mi(e,t,n,i)}}function Or(e,t,n,i,s){for(s=s&&((t.subtreeFlags&10256)!==0||!1),t=t.child;t!==null;){var a=e,r=t,o=n,l=i,c=r.flags;switch(r.tag){case 0:case 11:case 15:Or(a,r,o,l,s),rc(8,r);break;case 23:break;case 22:var f=r.stateNode;r.memoizedState!==null?f._visibility&2?Or(a,r,o,l,s):Ll(a,r):(f._visibility|=2,Or(a,r,o,l,s)),s&&c&2048&&Yg(r.alternate,r);break;case 24:Or(a,r,o,l,s),s&&c&2048&&Zg(r.alternate,r);break;default:Or(a,r,o,l,s)}t=t.sibling}}function Ll(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,i=t,s=i.flags;switch(i.tag){case 22:Ll(n,i),s&2048&&Yg(i.alternate,i);break;case 24:Ll(n,i),s&2048&&Zg(i.alternate,i);break;default:Ll(n,i)}t=t.sibling}}var Xa=8192;function Va(e,t,n){if(e.subtreeFlags&Xa)for(e=e.child;e!==null;)yM(e,t,n),e=e.sibling}function yM(e,t,n){switch(e.tag){case 26:Va(e,t,n),e.flags&Xa&&(e.memoizedState!==null?Bw(n,Ri,e.memoizedState,e.memoizedProps):(e=e.stateNode,(t&335544128)===t&&sx(n,e)));break;case 5:Va(e,t,n),e.flags&Xa&&(e=e.stateNode,(t&335544128)===t&&sx(n,e));break;case 3:case 4:var i=Ri;Ri=Zl(e.stateNode.containerInfo),Va(e,t,n),Ri=i;break;case 22:e.memoizedState===null&&(i=e.alternate,i!==null&&i.memoizedState!==null?(i=Xa,Xa=16777216,Va(e,t,n),Xa=i):Va(e,t,n));break;case 30:if((e.flags&Xa)!==0&&(i=e.memoizedProps.name,i!=null&&i!=="auto")){var s=e.stateNode;s.paired=null,$n===null&&($n=new Map),$n.set(i,s)}Va(e,t,n);break;default:Va(e,t,n)}}function xM(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function ml(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var i=t[n];on=i,MM(i,e)}xM(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)SM(e),e=e.sibling}function SM(e){switch(e.tag){case 0:case 11:case 15:ml(e),e.flags&2048&&ya(9,e,e.return);break;case 3:ml(e);break;case 12:ml(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Yu(e)):ml(e);break;default:ml(e)}}function Yu(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var i=t[n];on=i,MM(i,e)}xM(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:ya(8,t,t.return),Yu(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Yu(t));break;default:Yu(t)}e=e.sibling}}function MM(e,t){for(;on!==null;){var n=on;switch(n.tag){case 0:case 11:case 15:ya(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var i=n.memoizedState.cachePool.pool;i!=null&&i.refCount++}break;case 24:sc(n.memoizedState.cache)}if(i=n.child,i!==null)i.return=n,on=i;else t:for(n=e;on!==null;){i=on;var s=i.sibling,a=i.return;if(hM(i),i===n){on=null;break t}if(s!==null){s.return=a,on=s;break t}on=a}}}var OA={getCacheForType:function(e){var t=mn(Je),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return mn(Je).controller.signal}},IA=typeof WeakMap=="function"?WeakMap:Map,le=0,be=null,Qt=null,$t=0,pe=0,Kn=null,ia=!1,Mo=!1,Jg=!1,Rs=0,Ve=0,xa=0,Qa=0,Sh=0,ti=0,lo=0,Ol=null,Vn=null,km=!1,kh=0,bM=0,Mh=1/0,bh=null,fa=null,Fe=0,Di=null,ar=null,ns=0,Xm=0,Wm=null,EM=null,eo=null,no=null,io=null,Il=0,Zu=null;function si(){return(le&2)!==0&&$t!==0?$t&-$t:Lt.T!==null?Qg():Cx()}function TM(){if(ti===0)if(($t&536870912)===0||Zt){var e=gu;gu<<=1,(gu&3932160)===0&&(gu=262144),ti=e}else ti=536870912;return e=yn.current,e!==null&&(e.flags|=32),ti}function co(e,t){if(t!=null){var n=e.stateNode,i=n.ref;i===null&&(i=n.ref=qM(Ts(e.memoizedProps,n))),no===null&&(no=[]),no.push(t.bind(null,i))}}function Xn(e,t,n){(e===be&&(pe===2||pe===9)||e.cancelPendingCommit!==null)&&(uo(e,0),sa(e,$t,ti,!1)),ec(e,n),((le&2)===0||e!==be)&&(e===be&&((le&2)===0&&(Qa|=n),Ve===4&&sa(e,$t,ti,!1)),as(e))}function AM(e,t,n){if((le&6)!==0)throw Error(Q(327));var i=!n&&(t&127)===0&&(t&e.expiredLanes)===0||tc(e,t),s=i?zA(e,t):kp(e,t,!0),a=i;do{if(s===0){Mo&&!i&&sa(e,t,0,!1);break}else{if(n=e.current.alternate,a&&!PA(n)){s=kp(e,t,!1),a=!1;continue}if(s===2){if(a=t,e.errorRecoveryDisabledLanes&a)var r=0;else r=e.pendingLanes&-536870913,r=r!==0?r:r&536870912?536870912:0;if(r!==0){t=r;t:{var o=e;s=Ol;var l=o.current.memoizedState.isDehydrated;if(l&&(uo(o,r).flags|=256),r=kp(o,r,!1),r!==2&&r!==6){if(Jg&&!l){o.errorRecoveryDisabledLanes|=a,Qa|=a,s=4;break t}a=Vn,Vn=s,a!==null&&(Vn===null?Vn=a:Vn.push.apply(Vn,a))}s=r}if(a=!1,s!==2)continue}}if(s===1){uo(e,0),sa(e,t,0,!0);break}t:{switch(i=e,a=s,a){case 0:case 1:throw Error(Q(345));case 4:if((t&4194048)!==t&&(t&62914560)!==t)break;case 6:sa(i,t,ti,!ia);break t;case 2:Vn=null;break;case 3:case 5:break;default:throw Error(Q(329))}if((t&62914560)===t&&(s=kh+300-ei(),10<s)){if(sa(i,t,ti,!ia),Rh(i,0,!0)!==0)break t;ns=t,i.timeoutHandle=$g(Ly.bind(null,i,n,Vn,bh,km,t,ti,Qa,lo,ia,a,"Throttled",-0,0),s);break t}Ly(i,n,Vn,bh,km,t,ti,Qa,lo,ia,a,null,-0,0)}}break}while(!0);as(e)}function Ly(e,t,n,i,s,a,r,o,l,c,f,p,u,d){e.timeoutHandle=-1;var v=t.subtreeFlags,M=(a&335544064)===a;if(p=null,(M||v&8192||(v&16785408)===16785408)&&(p={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:ji},$n=null,yM(t,a,p),M&&(v=p,M=e.containerInfo,M=(M.nodeType===9?M:M.ownerDocument).__reactViewTransition,M!=null&&(v.count++,v.waitingForViewTransition=!0,v=Jl.bind(v),M.finished.then(v,v))),v=(a&62914560)===a?kh-ei():(a&4194048)===a?bM-ei():0,v=zw(p,v),v!==null)){ns=a,e.cancelPendingCommit=v(Iy.bind(null,e,t,a,n,i,s,r,o,l,c,f,p,null,u,d)),sa(e,a,r,!c);return}Iy(e,t,a,n,i,s,r,o,l,c,f,p)}function PA(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var i=0;i<n.length;i++){var s=n[i],a=s.getSnapshot;s=s.value;try{if(!ai(a(),s))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function sa(e,t,n,i){t=bx(e,t),t&=~Sh,t&=~Qa,e.suspendedLanes|=t,e.pingedLanes&=~t,i&&(e.warmLanes|=t),i=e.expirationTimes;for(var s=t;0<s;){var a=31-ii(s),r=1<<a;i[a]=-1,s&=~r}n!==0&&Tx(e,n,t)}function Xh(){return(le&6)===0?(oc(0,!1),!1):!0}function Kg(){if(Qt!==null){if(pe===0)var e=Qt.return;else e=Qt,Ss=ur=null,Lg(e),jr=null,Gl=0,e=Qt;for(;e!==null;)tM(e.alternate,e),e=e.return;Qt=null}}function uo(e,t){var n=e.timeoutHandle;return n!==-1&&(e.timeoutHandle=-1,sw(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),ns=0,Kg(),be=e,Qt=n=Ms(e.current,null),$t=t,pe=0,Kn=null,ia=!1,Mo=tc(e,t),Jg=!1,lo=ti=Sh=Qa=xa=Ve=0,Vn=Ol=null,km=!1,Rs=bx(e,t),Oh(),n}function wM(e,t){Ft=null,Lt.H=mh,t===xo||t===Bh?(t=ry(),pe=3):t===Tg?(t=ry(),pe=4):pe=t===Vg?8:t!==null&&typeof t=="object"&&typeof t.then=="function"?6:1,Kn=t,Qt===null&&(Ve=1,gh(e,xi(t,e.current)))}function CM(){var e=yn.current;return e===null?!0:($t&4194048)===$t?wn===null:($t&62914560)===$t||($t&536870912)!==0?e===wn:!1}function RM(){var e=Lt.H;return Lt.H=mh,e===null?mh:e}function NM(){var e=Lt.A;return Lt.A=OA,e}function Eh(){Ve=4,ia||($t&4194048)!==$t&&yn.current!==null||(Mo=!0),(xa&134217727)===0&&(Qa&134217727)===0||be===null||sa(be,$t,ti,!1)}function kp(e,t,n){var i=le;le|=2;var s=RM(),a=NM();(be!==e||$t!==t)&&(bh=null,uo(e,t)),t=!1;var r=Ve;t:do try{if(pe!==0&&Qt!==null){var o=Qt,l=Kn;switch(pe){case 8:Kg(),r=6;break t;case 3:case 2:case 9:case 6:yn.current===null&&(t=!0);var c=pe;if(pe=0,Kn=null,Yr(e,o,l,c),n&&Mo){r=0;break t}break;default:c=pe,pe=0,Kn=null,Yr(e,o,l,c)}}BA(),r=Ve;break}catch(f){wM(e,f)}while(!0);return t&&e.shellSuspendCounter++,Ss=ur=null,le=i,Lt.H=s,Lt.A=a,Qt===null&&(be=null,$t=0,Oh()),r}function BA(){for(;Qt!==null;)DM(Qt)}function zA(e,t){var n=le;le|=2;var i=RM(),s=NM();be!==e||$t!==t?(bh=null,Mh=ei()+500,uo(e,t)):Mo=tc(e,t);t:do try{if(pe!==0&&Qt!==null){t=Qt;var a=Kn;e:switch(pe){case 1:pe=0,Kn=null,Yr(e,t,a,1);break;case 2:case 9:if(ay(a)){pe=0,Kn=null,Oy(t);break}t=function(){pe!==2&&pe!==9||be!==e||(pe=7),as(e)},a.then(t,t);break t;case 3:pe=7;break t;case 4:pe=5;break t;case 7:ay(a)?(pe=0,Kn=null,Oy(t)):(pe=0,Kn=null,Yr(e,t,a,7));break;case 5:var r=null;switch(Qt.tag){case 26:r=Qt.memoizedState;case 5:case 27:var o=Qt;if(r?nb(r):o.stateNode.complete){pe=0,Kn=null;var l=o.sibling;if(l!==null)Qt=l;else{var c=o.return;c!==null?(Qt=c,Wh(c)):Qt=null}break e}}pe=0,Kn=null,Yr(e,t,a,5);break;case 6:pe=0,Kn=null,Yr(e,t,a,6);break;case 8:Kg(),Ve=6;break t;default:throw Error(Q(462))}}FA();break}catch(f){wM(e,f)}while(!0);return Ss=ur=null,Lt.H=i,Lt.A=s,le=n,Qt!==null?0:(be=null,$t=0,Oh(),Ve)}function FA(){for(;Qt!==null&&!nT();)DM(Qt)}function DM(e){var t=$S(e.alternate,e,Rs);e.memoizedProps=e.pendingProps,t===null?Wh(e):Qt=t}function Oy(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=My(n,t,t.pendingProps,t.type,void 0,$t);break;case 11:t=My(n,t,t.pendingProps,t.type.render,t.ref,$t);break;case 5:Lg(t);var i=t;i===cn&&(Zt?(lh(i),i.tag===5&&i.stateNode!=null&&(Ne=i.stateNode)):(lh(i),Zt=!0));default:tM(n,t),t=Qt=eS(t,Rs),t=$S(n,t,Rs)}e.memoizedProps=e.pendingProps,t===null?Wh(e):Qt=t}function Yr(e,t,n,i){Ss=ur=null,Lg(t),jr=null,Gl=0;var s=t.return;try{if(AA(e,s,t,n,$t)){Ve=1,gh(e,xi(n,e.current)),Qt=null;return}}catch(a){if(s!==null)throw Qt=s,a;Ve=1,gh(e,xi(n,e.current)),Qt=null;return}t.flags&32768?(Zt||i===1?e=!0:Mo||($t&536870912)!==0?e=!1:(ia=e=!0,(i===2||i===9||i===3||i===6)&&(i=yn.current,i!==null&&i.tag===13&&(i.flags|=16384))),UM(t,e)):Wh(t)}function Wh(e){var t=e;do{if((t.flags&32768)!==0){UM(t,ia);return}e=t.return;var n=NA(t.alternate,t,Rs);if(n!==null){Qt=n;return}if(t=t.sibling,t!==null){Qt=t;return}Qt=t=e}while(t!==null);Ve===0&&(Ve=5)}function UM(e,t){do{var n=DA(e.alternate,e);if(n!==null){n.flags&=32767,Qt=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){Qt=e;return}Qt=e=n}while(e!==null);Ve=6,Qt=null}function Iy(e,t,n,i,s,a,r,o,l,c,f,p){e.cancelPendingCommit=null;do qh();while(Fe!==0);if((le&6)!==0)throw Error(Q(327));if(t!==null){if(t===e.current)throw Error(Q(177));e===be&&(Qt=be=null,$t=0),ar=t,Di=e,ns=n,Wm=s,EM=i,HA(e,t,n,r,o,l,p)}}function HA(e,t,n,i,s,a,r){var o=t.lanes|t.childLanes;if(Xm=o,o|=yg,fT(e,n,o,i,s,a),no=null,(n&335544064)===n?(io=pA(e),i=10262):(io=null,i=10256),(t.subtreeFlags&i)!==0||(t.flags&i)!==0?(e.callbackNode=null,e.callbackPriority=0,qA(ih,function(){return Jm(),null})):(e.callbackNode=null,e.callbackPriority=0),yh=!1,i=(t.flags&13878)!==0,(t.subtreeFlags&13878)!==0||i){i=Lt.T,Lt.T=null,s=ce.p,ce.p=2,a=le,le|=4;try{UA(e,t,n)}finally{le=a,ce.p=s,Lt.T=i}}Fe=1,yh?eo=uw(r,e.containerInfo,io,qm,Ym,GA,Zm,Jm,VA,null,null):(qm(),Ym(),Zm())}function VA(e){if(Fe!==0){var t=Di.onRecoverableError;t(e,{componentStack:null})}}function GA(){Fe===3&&(Fe=0,_M(ar,Di),Fe=4)}function qm(){if(Fe===1){Fe=0;var e=Di,t=ar,n=ns,i=(t.flags&13878)!==0;if((t.subtreeFlags&13878)!==0||i){i=Lt.T,Lt.T=null;var s=ce.p;ce.p=2;var a=le;le|=4;try{Ml=xh=!1,mM(t,e,n),n=$m;var r=Yx(e.containerInfo),o=n.focusedElem,l=n.selectionRange;if(r!==o&&o&&o.ownerDocument&&qx(o.ownerDocument.documentElement,o)){if(l!==null&&vg(o)){var c=l.start,f=l.end;if(f===void 0&&(f=c),"selectionStart"in o)o.selectionStart=c,o.selectionEnd=Math.min(f,o.value.length);else{var p=o.ownerDocument||document,u=p&&p.defaultView||window;if(u.getSelection){var d=u.getSelection(),v=o.textContent.length,M=Math.min(l.start,v),_=l.end===void 0?M:Math.min(l.end,v);!d.extend&&M>_&&(r=_,_=M,M=r);var h=Qv(o,M),m=Qv(o,_);if(h&&m&&(d.rangeCount!==1||d.anchorNode!==h.node||d.anchorOffset!==h.offset||d.focusNode!==m.node||d.focusOffset!==m.offset)){var S=p.createRange();S.setStart(h.node,h.offset),d.removeAllRanges(),M>_?(d.addRange(S),d.extend(m.node,m.offset)):(S.setEnd(m.node,m.offset),d.addRange(S))}}}}for(p=[],d=o;d=d.parentNode;)d.nodeType===1&&p.push({element:d,left:d.scrollLeft,top:d.scrollTop});for(typeof o.focus=="function"&&o.focus(),o=0;o<p.length;o++){var y=p[o];y.element.scrollLeft=y.left,y.element.scrollTop=y.top}}go=!!jm,$m=jm=null}finally{le=a,ce.p=s,Lt.T=i}}e.current=t,Fe=2}}function Ym(){if(Fe===2){Fe=0;var e=Di,t=ar,n=(t.flags&8772)!==0;if((t.subtreeFlags&8772)!==0||n){n=Lt.T,Lt.T=null;var i=ce.p;ce.p=2;var s=le;le|=4;try{cM(e,t.alternate,t)}finally{le=s,ce.p=i,Lt.T=n}}Fe=3}}function Zm(){if(Fe===4||Fe===3){Fe=0;var e=eo;eo=null,iT();var t=Di,n=ar,i=ns,s=EM,a=(i&335544064)===i?10262:10256;if((n.subtreeFlags&a)!==0||(n.flags&a)!==0?Fe=5:(Fe=0,ar=Di=null,LM(t,t.pendingLanes)),a=t.pendingLanes,a===0&&(fa=null),fg(i),n=n.stateNode,ni&&typeof ni.onCommitFiberRoot=="function")try{ni.onCommitFiberRoot($l,n,void 0,(n.current.flags&128)===128)}catch{}if(s!==null){n=Lt.T,a=ce.p,ce.p=2,Lt.T=null;try{for(var r=t.onRecoverableError,o=0;o<s.length;o++){var l=s[o];r(l.value,{componentStack:l.stack})}}finally{Lt.T=n,ce.p=a}}if(s=no,r=io,io=null,s!==null&&(no=null,r===null&&(r=[]),e!==null))for(l=0;l<s.length;l++)n=(0,s[l])(r),n!==void 0&&e.finished.finally(n);(ns&3)!==0&&qh(),as(t),a=t.pendingLanes,(i&261930)!==0&&(a&42)!==0?t===Zu?Il++:(Il=0,Zu=t):(Il=0,Zu=null),oc(0,!1)}}function LM(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,sc(t)))}function qh(){return eo!==null&&(eo.skipTransition(),eo=null),qm(),Ym(),Zm(),Jm()}function Jm(){if(Fe!==5)return!1;var e=Di,t=Xm;Xm=0;var n=fg(ns),i=Lt.T,s=ce.p;try{ce.p=32>n?32:n,Lt.T=null,n=Wm,Wm=null;var a=Di,r=ns;if(Fe=0,ar=Di=null,ns=0,(le&6)!==0)throw Error(Q(331));var o=le;if(le|=4,SM(a.current),vM(a,a.current,r,n),le=o,oc(0,!1),ni&&typeof ni.onPostCommitFiberRoot=="function")try{ni.onPostCommitFiberRoot($l,a)}catch{}return!0}finally{ce.p=s,Lt.T=i,LM(e,t)}}function Py(e,t,n){t=xi(n,t),t=Cm(e.stateNode,t,2),e=ca(e,t,2),e!==null&&(ec(e,2),as(e))}function ge(e,t,n){if(e.tag===3)Py(e,e,n);else for(;t!==null;){if(t.tag===3){Py(t,e,n);break}else if(t.tag===1){var i=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof i.componentDidCatch=="function"&&(fa===null||!fa.has(i))){e=xi(n,e),n=ZS(2),i=ca(t,n,2),i!==null&&(JS(n,i,t,e),ec(i,2),as(i));break}}t=t.return}}function Xp(e,t,n){var i=e.pingCache;if(i===null){i=e.pingCache=new IA;var s=new Set;i.set(t,s)}else s=i.get(t),s===void 0&&(s=new Set,i.set(t,s));s.has(n)||(Jg=!0,s.add(n),e=kA.bind(null,e,t,n),t.then(e,e))}function kA(e,t,n){var i=e.pingCache;i!==null&&i.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,be===e&&($t&n)===n&&((Ve===4||Ve===3&&($t&62914560)===$t&&300>ei()-kh)&&(le&2)===0?uo(e,0):Sh|=n,lo===$t&&(lo=0)),as(e)}function OM(e,t){t===0&&(t=Ex()),e=cr(e,t),e!==null&&(ec(e,t),as(e))}function XA(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),OM(e,n)}function WA(e,t){var n=0;switch(e.tag){case 31:case 13:var i=e.stateNode,s=e.memoizedState;s!==null&&(n=s.retryLane);break;case 19:i=e.stateNode;break;case 22:i=e.stateNode._retryCache;break;default:throw Error(Q(314))}i!==null&&i.delete(t),OM(e,n)}function qA(e,t){return ug(e,t)}var ho=null,Ir=null,Km=!1,Th=!1,Wp=!1,aa=0;function as(e){e!==Ir&&e.next===null&&(Ir===null?ho=Ir=e:Ir=Ir.next=e),Th=!0,Km||(Km=!0,ZA())}function oc(e,t){if(!Wp&&Th){Wp=!0;do for(var n=!1,i=ho;i!==null;){if(!t)if(e!==0){var s=i.pendingLanes;if(s===0)var a=0;else{var r=i.suspendedLanes,o=i.pingedLanes;a=(1<<31-ii(42|e)+1)-1,a&=s&~(r&~o),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,By(i,a))}else a=$t,a=Rh(i,i===be?a:0,i.cancelPendingCommit!==null||i.timeoutHandle!==-1),(a&3)===0||tc(i,a)||(n=!0,By(i,a));i=i.next}while(n);Wp=!1}}function YA(){IM()}function IM(){Th=Km=!1;var e=0;aa!==0&&iw()&&(e=aa);for(var t=ei(),n=null,i=ho;i!==null;){var s=i.next,a=PM(i,t);a===0?(i.next=null,n===null?ho=s:n.next=s,s===null&&(Ir=n)):(n=i,(e!==0||(a&3)!==0)&&(Th=!0)),i=s}Fe!==0&&Fe!==5||oc(e,!1),aa!==0&&(aa=0)}function PM(e,t){for(var n=e.suspendedLanes,i=e.pingedLanes,s=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var r=31-ii(a),o=1<<r,l=s[r];l===-1?((o&n)===0||(o&i)!==0)&&(s[r]=hT(o,t)):l<=t&&(e.expiredLanes|=o),a&=~o}if(t=be,n=$t,n=Rh(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),i=e.callbackNode,n===0||e===t&&(pe===2||pe===9)||e.cancelPendingCommit!==null)return i!==null&&i!==null&&bp(i),e.callbackNode=null,e.callbackPriority=0;if((n&3)===0||tc(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(i!==null&&bp(i),fg(n)){case 2:case 8:n=Sx;break;case 32:n=ih;break;case 268435456:n=Mx;break;default:n=ih}return i=BM.bind(null,e),n=ug(n,i),e.callbackPriority=t,e.callbackNode=n,t}return i!==null&&i!==null&&bp(i),e.callbackPriority=2,e.callbackNode=null,2}function BM(e,t){if(Fe!==0&&Fe!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(qh()&&e.callbackNode!==n)return null;var i=$t;return i=Rh(e,e===be?i:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),i===0?null:(AM(e,i,t),PM(e,ei()),e.callbackNode!=null&&e.callbackNode===n?BM.bind(null,e):null)}function By(e,t){if(qh())return null;AM(e,t,!0)}function ZA(){aw(function(){(le&6)!==0?ug(xx,YA):IM()})}function Qg(){if(aa===0){var e=er;e===0&&(e=mu,mu<<=1,(mu&261888)===0&&(mu=256)),aa=e}return aa}function zy(e){return e==null||typeof e=="symbol"||typeof e=="boolean"?null:typeof e=="function"?e:Pu(e)}function JA(e,t,n,i,s){if(t==="submit"&&n&&n.stateNode===s){var a=zy((s[qn]||null).action),r=i.submitter;r&&(t=(t=r[qn]||null)?zy(t.formAction):r.getAttribute("formAction"),t!==null&&(a=t,r=null));var o=new Dh("action","action",null,i,s);e.push({event:o,listeners:[{instance:null,listener:function(){if(i.defaultPrevented){if(aa!==0){var l=new FormData(s,r);Am(n,{pending:!0,data:l,method:s.method,action:a},null,l)}}else typeof a=="function"&&(o.preventDefault(),l=new FormData(s,r),Am(n,{pending:!0,data:l,method:s.method,action:a},a,l))},currentTarget:s}]})}}for(Nu=0;Nu<mm.length;Nu++)Du=mm[Nu],Fy=Du.toLowerCase(),Hy=Du[0].toUpperCase()+Du.slice(1),Ui(Fy,"on"+Hy);var Du,Fy,Hy,Nu;Ui(Jx,"onAnimationEnd");Ui(Kx,"onAnimationIteration");Ui(Qx,"onAnimationStart");Ui("dblclick","onDoubleClick");Ui("focusin","onFocus");Ui("focusout","onBlur");Ui(rA,"onTransitionRun");Ui(oA,"onTransitionStart");Ui(lA,"onTransitionCancel");Ui(jx,"onTransitionEnd");ao("onMouseEnter",["mouseout","mouseover"]);ao("onMouseLeave",["mouseout","mouseover"]);ao("onPointerEnter",["pointerout","pointerover"]);ao("onPointerLeave",["pointerout","pointerover"]);or("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));or("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));or("onBeforeInput",["compositionend","keypress","textInput","paste"]);or("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));or("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));or("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Wl="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),KA=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Wl));function zM(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var i=e[n],s=i.event;i=i.listeners;t:{var a=void 0;if(t)for(var r=i.length-1;0<=r;r--){var o=i[r],l=o.instance,c=o.currentTarget;if(o=o.listener,l!==a&&s.isPropagationStopped())break t;a=o,s.currentTarget=c;try{a(s)}catch(f){ah(f)}s.currentTarget=null,a=l}else for(r=0;r<i.length;r++){if(o=i[r],l=o.instance,c=o.currentTarget,o=o.listener,l!==a&&s.isPropagationStopped())break t;a=o,s.currentTarget=c;try{a(s)}catch(f){ah(f)}s.currentTarget=null,a=l}}}}function Kt(e,t){var n=t[Ov];n===void 0&&(n=t[Ov]=new Set);var i=e+"__bubble";n.has(i)||(FM(t,e,2,!1),n.add(i))}function qp(e,t,n){var i=0;t&&(i|=4),FM(n,e,i,t)}var Uu="_reactListening"+Math.random().toString(36).slice(2);function jg(e){if(!e[Uu]){e[Uu]=!0,Nx.forEach(function(n){n!=="selectionchange"&&(KA.has(n)||qp(n,!1,e),qp(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Uu]||(t[Uu]=!0,qp("selectionchange",!1,t))}}function FM(e,t,n,i){switch(cb(t)){case 2:var s=Gw;break;case 8:s=kw;break;default:s=a0}n=s.bind(null,t,n,e),s=void 0,!hm||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(s=!0),i?s!==void 0?e.addEventListener(t,n,{capture:!0,passive:s}):e.addEventListener(t,n,!0):s!==void 0?e.addEventListener(t,n,{passive:s}):e.addEventListener(t,n,!1)}function Yp(e,t,n,i,s){var a=i;if((t&1)===0&&(t&2)===0&&i!==null)t:for(;;){if(i===null)return;var r=i.tag;if(r===3||r===4){var o=i.stateNode.containerInfo;if(o===s)break;if(r===4)for(r=i.return;r!==null;){var l=r.tag;if((l===3||l===4)&&r.stateNode.containerInfo===s)return;r=r.return}for(;o!==null;){if(r=Wa(o),r===null)return;if(l=r.tag,l===5||l===6||l===26||l===27){i=a=r;continue t}o=o.parentNode}}i=i.return}zx(function(){var c=a,f=pg(n),p=[];t:{var u=$x.get(e);if(u!==void 0){var d=Dh,v=e;switch(e){case"keypress":if(zu(n)===0)break t;case"keydown":case"keyup":d=PT;break;case"focusin":v="focus",d=Rp;break;case"focusout":v="blur",d=Rp;break;case"beforeblur":case"afterblur":d=Rp;break;case"click":if(n.button===2)break t;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":d=Gv;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":d=ET;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":d=VT;break;case Jx:case Kx:case Qx:d=wT;break;case jx:d=kT;break;case"scroll":case"scrollend":d=MT;break;case"wheel":d=WT;break;case"copy":case"cut":case"paste":d=RT;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":d=Xv;break;case"submit":d=FT;break;case"toggle":case"beforetoggle":d=YT}var M=(t&4)!==0,_=!M&&(e==="scroll"||e==="scrollend"),h=M?u!==null?u+"Capture":null:u;M=[];for(var m=c,S;m!==null;){var y=m;if(S=y.stateNode,y=y.tag,y!==5&&y!==26&&y!==27||S===null||h===null||(y=Bl(m,h),y!=null&&M.push(ql(m,y,S))),_)break;m=m.return}0<M.length&&(u=new d(u,v,null,n,f),p.push({event:u,listeners:M}))}}if((t&7)===0){t:{if(d=e==="mouseover"||e==="pointerover",u=e==="mouseout"||e==="pointerout",d&&n!==um&&(v=n.relatedTarget||n.fromElement)&&(Wa(v)||v[vo]))break t;(u||d)&&(v=f.window===f?f:(d=f.ownerDocument)?d.defaultView||d.parentWindow:window,u?(d=n.relatedTarget||n.toElement,u=c,d=d?Wa(d):null,d!==null&&(_=jl(d),M=d.tag,d!==_||M!==5&&M!==27&&M!==6)&&(d=null)):(u=null,d=c),u!==d&&(M=Gv,y="onMouseLeave",h="onMouseEnter",m="mouse",(e==="pointerout"||e==="pointerover")&&(M=Xv,y="onPointerLeave",h="onPointerEnter",m="pointer"),_=u==null?v:xl(u),S=d==null?v:xl(d),v=new M(y,m+"leave",u,n,f),v.target=_,v.relatedTarget=S,y=null,Wa(f)===c&&(M=new M(h,m+"enter",d,n,f),M.target=S,M.relatedTarget=_,y=M),_=y,M=u&&d?jp(u,d,QA):null,u!==null&&Vy(p,v,u,M,!1),d!==null&&_!==null&&Vy(p,_,d,M,!0)))}t:{if(u=c?xl(c):window,d=u.nodeName&&u.nodeName.toLowerCase(),d==="select"||d==="input"&&u.type==="file")var E=Zv;else if(Yv(u))if(Xx)E=iA;else{E=eA;var A=tA}else d=u.nodeName,!d||d.toLowerCase()!=="input"||u.type!=="checkbox"&&u.type!=="radio"?c&&dg(c.elementType)&&(E=Zv):E=nA;if(E&&(E=E(e,c))){kx(p,E,n,f);break t}A&&A(e,u,c)}switch(A=c?xl(c):window,e){case"focusin":(Yv(A)||A.contentEditable==="true")&&(Vr=A,dm=c,Tl=null);break;case"focusout":Tl=dm=Vr=null;break;case"mousedown":pm=!0;break;case"contextmenu":case"mouseup":case"dragend":pm=!1,jv(p,n,f);break;case"selectionchange":if(aA)break;case"keydown":case"keyup":jv(p,n,f)}var C;if(_g)t:{switch(e){case"compositionstart":var g="onCompositionStart";break t;case"compositionend":g="onCompositionEnd";break t;case"compositionupdate":g="onCompositionUpdate";break t}g=void 0}else Hr?Vx(e,n)&&(g="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(g="onCompositionStart");g&&(Hx&&n.locale!=="ko"&&(Hr||g!=="onCompositionStart"?g==="onCompositionEnd"&&Hr&&(C=Fx()):(ea=f,mg="value"in ea?ea.value:ea.textContent,Hr=!0)),A=Ah(c,g),0<A.length&&(g=new kv(g,e,null,n,f),p.push({event:g,listeners:A}),C?g.data=C:(C=Gx(n),C!==null&&(g.data=C)))),(C=JT?KT(e,n):QT(e,n))&&(g=Ah(c,"onBeforeInput"),0<g.length&&(A=new kv("onBeforeInput","beforeinput",null,n,f),p.push({event:A,listeners:g}),A.data=C)),JA(p,e,c,n,f)}zM(p,t)})}function ql(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Ah(e,t){for(var n=t+"Capture",i=[];e!==null;){var s=e,a=s.stateNode;if(s=s.tag,s!==5&&s!==26&&s!==27||a===null||(s=Bl(e,n),s!=null&&i.unshift(ql(e,s,a)),s=Bl(e,t),s!=null&&i.push(ql(e,s,a))),e.tag===3)return i;e=e.return}return[]}function QA(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Vy(e,t,n,i,s){for(var a=t._reactName,r=[];n!==null&&n!==i;){var o=n,l=o.alternate,c=o.stateNode;if(o=o.tag,l!==null&&l===i)break;o!==5&&o!==26&&o!==27||c===null||(l=c,s?(c=Bl(n,a),c!=null&&r.unshift(ql(n,c,l))):s||(c=Bl(n,a),c!=null&&r.push(ql(n,c,l)))),n=n.return}r.length!==0&&e.push({event:t,listeners:r})}var jA=/\r\n?/g,$A=/\u0000|\uFFFD/g;function Gy(e){return(typeof e=="string"?e:""+e).replace(jA,`
`).replace($A,"")}function HM(e,t){return t=Gy(t),Gy(e)===t}function me(e,t,n,i,s,a){switch(n){case"children":if(typeof i=="string")t==="body"||t==="textarea"&&i===""||ro(e,i);else if(typeof i=="number"||typeof i=="bigint")t!=="body"&&ro(e,""+i);else return;break;case"className":vu(e,"class",i);break;case"tabIndex":vu(e,"tabindex",i);break;case"dir":case"role":case"viewBox":case"width":case"height":vu(e,n,i);break;case"style":Bx(e,i,a);return;case"data":if(t!=="object"){vu(e,"data",i);break}case"src":case"href":if(i===""&&(t!=="a"||n!=="href")){e.removeAttribute(n);break}if(i==null||typeof i=="function"||typeof i=="symbol"||typeof i=="boolean"){e.removeAttribute(n);break}i=Pu(i),e.setAttribute(n,i);break;case"action":case"formAction":if(typeof i=="function"){e.setAttribute(n,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof a=="function"&&(n==="formAction"?(t!=="input"&&me(e,t,"name",s.name,s,null),me(e,t,"formEncType",s.formEncType,s,null),me(e,t,"formMethod",s.formMethod,s,null),me(e,t,"formTarget",s.formTarget,s,null)):(me(e,t,"encType",s.encType,s,null),me(e,t,"method",s.method,s,null),me(e,t,"target",s.target,s,null)));if(i==null||typeof i=="symbol"||typeof i=="boolean"){e.removeAttribute(n);break}i=Pu(i),e.setAttribute(n,i);break;case"onClick":i!=null&&(e.onclick=ji);return;case"onScroll":i!=null&&Kt("scroll",e);return;case"onScrollEnd":i!=null&&Kt("scrollend",e);return;case"dangerouslySetInnerHTML":if(i!=null){if(typeof i!="object"||!("__html"in i))throw Error(Q(61));if(n=i.__html,n!=null){if(s.children!=null)throw Error(Q(60));a?.__html!==n&&(e.innerHTML=n)}}break;case"multiple":e.multiple=i&&typeof i!="function"&&typeof i!="symbol";break;case"muted":e.muted=i&&typeof i!="function"&&typeof i!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(i==null||typeof i=="function"||typeof i=="boolean"||typeof i=="symbol"){e.removeAttribute("xlink:href");break}n=Pu(i),e.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",n);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":i!=null&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,i):e.removeAttribute(n);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"credentialless":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":i&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,""):e.removeAttribute(n);break;case"capture":case"download":i===!0?e.setAttribute(n,""):i!==!1&&i!=null&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,i):e.removeAttribute(n);break;case"cols":case"rows":case"size":case"span":i!=null&&typeof i!="function"&&typeof i!="symbol"&&!isNaN(i)&&1<=i?e.setAttribute(n,i):e.removeAttribute(n);break;case"rowSpan":case"start":i==null||typeof i=="function"||typeof i=="symbol"||isNaN(i)?e.removeAttribute(n):e.setAttribute(n,i);break;case"popover":Kt("beforetoggle",e),Kt("toggle",e),Iu(e,"popover",i);break;case"xlinkActuate":vs(e,"http://www.w3.org/1999/xlink","xlink:actuate",i);break;case"xlinkArcrole":vs(e,"http://www.w3.org/1999/xlink","xlink:arcrole",i);break;case"xlinkRole":vs(e,"http://www.w3.org/1999/xlink","xlink:role",i);break;case"xlinkShow":vs(e,"http://www.w3.org/1999/xlink","xlink:show",i);break;case"xlinkTitle":vs(e,"http://www.w3.org/1999/xlink","xlink:title",i);break;case"xlinkType":vs(e,"http://www.w3.org/1999/xlink","xlink:type",i);break;case"xmlBase":vs(e,"http://www.w3.org/XML/1998/namespace","xml:base",i);break;case"xmlLang":vs(e,"http://www.w3.org/XML/1998/namespace","xml:lang",i);break;case"xmlSpace":vs(e,"http://www.w3.org/XML/1998/namespace","xml:space",i);break;case"is":Iu(e,"is",i);break;case"innerText":case"textContent":return;default:if(!(2<n.length)||n[0]!=="o"&&n[0]!=="O"||n[1]!=="n"&&n[1]!=="N")n=xT.get(n)||n,Iu(e,n,i);else return}re=!0}function Qm(e,t,n,i,s,a){switch(n){case"style":Bx(e,i,a);return;case"dangerouslySetInnerHTML":if(i!=null){if(typeof i!="object"||!("__html"in i))throw Error(Q(61));if(n=i.__html,n!=null){if(s.children!=null)throw Error(Q(60));a?.__html!==n&&(e.innerHTML=n)}}break;case"children":if(typeof i=="string")ro(e,i);else if(typeof i=="number"||typeof i=="bigint")ro(e,""+i);else return;break;case"onScroll":i!=null&&Kt("scroll",e);return;case"onScrollEnd":i!=null&&Kt("scrollend",e);return;case"onClick":i!=null&&(e.onclick=ji);return;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":return;case"innerText":case"textContent":return;default:if(!Dx.hasOwnProperty(n))t:{if(n[0]==="o"&&n[1]==="n"&&(s=n.endsWith("Capture"),a=n.slice(2,s?n.length-7:void 0),t=e[qn]||null,t=t!=null?t[n]:null,typeof t=="function"&&e.removeEventListener(a,t,s),typeof i=="function")){typeof t!="function"&&t!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(a,i,s);break t}re=!0,n in e?e[n]=i:i===!0?e.setAttribute(n,""):Iu(e,n,i)}return}re=!0}function vn(e,t,n){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":Kt("error",e),Kt("load",e);var i=!1,s=!1,a;for(a in n)if(n.hasOwnProperty(a)){var r=n[a];if(r!=null)switch(a){case"src":i=!0;break;case"srcSet":s=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(Q(137,t));default:me(e,t,a,r,n,null)}}s&&me(e,t,"srcSet",n.srcSet,n,null),i&&me(e,t,"src",n.src,n,null);return;case"input":Kt("invalid",e);var o=a=r=s=null,l=null,c=null;for(i in n)if(n.hasOwnProperty(i)){var f=n[i];if(f!=null)switch(i){case"name":s=f;break;case"type":r=f;break;case"checked":l=f;break;case"defaultChecked":c=f;break;case"value":a=f;break;case"defaultValue":o=f;break;case"children":case"dangerouslySetInnerHTML":if(f!=null)throw Error(Q(137,t));break;default:me(e,t,i,f,n,null)}}Ox(e,a,o,l,c,r,s,!1);return;case"select":Kt("invalid",e),i=r=a=null;for(s in n)if(n.hasOwnProperty(s)&&(o=n[s],o!=null))switch(s){case"value":a=o;break;case"defaultValue":r=o;break;case"multiple":i=o;default:me(e,t,s,o,n,null)}t=a,n=r,e.multiple=!!i,t!=null?Jr(e,!!i,t,!1):n!=null&&Jr(e,!!i,n,!0);return;case"textarea":Kt("invalid",e),a=s=i=null;for(r in n)if(n.hasOwnProperty(r)&&(o=n[r],o!=null))switch(r){case"value":i=o;break;case"defaultValue":s=o;break;case"children":a=o;break;case"dangerouslySetInnerHTML":if(o!=null)throw Error(Q(91));break;default:me(e,t,r,o,n,null)}Px(e,i,s,a);return;case"option":for(l in n)n.hasOwnProperty(l)&&(i=n[l],i!=null)&&(l==="selected"?e.selected=i&&typeof i!="function"&&typeof i!="symbol":me(e,t,l,i,n,null));return;case"dialog":Kt("beforetoggle",e),Kt("toggle",e),Kt("cancel",e),Kt("close",e);break;case"iframe":case"object":Kt("load",e);break;case"video":case"audio":for(i=0;i<Wl.length;i++)Kt(Wl[i],e);break;case"image":Kt("error",e),Kt("load",e);break;case"details":Kt("toggle",e);break;case"embed":case"source":case"link":Kt("error",e),Kt("load",e);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(c in n)if(n.hasOwnProperty(c)&&(i=n[c],i!=null))switch(c){case"children":case"dangerouslySetInnerHTML":throw Error(Q(137,t));default:me(e,t,c,i,n,null)}return;default:if(dg(t)){for(f in n)n.hasOwnProperty(f)&&(i=n[f],i!==void 0&&Qm(e,t,f,i,n,void 0));return}}for(o in n)n.hasOwnProperty(o)&&(i=n[o],i!=null&&me(e,t,o,i,n,null))}var tw={};function ew(e,t,n,i){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var s=null,a=null,r=null,o=null,l=null,c=null,f=null;for(d in n){var p=n[d];if(n.hasOwnProperty(d)&&p!=null)switch(d){case"checked":break;case"value":break;case"defaultValue":l=p;default:i.hasOwnProperty(d)||me(e,t,d,null,i,p)}}for(var u in i){var d=i[u];if(p=n[u],i.hasOwnProperty(u)&&(d!=null||p!=null))switch(u){case"type":d!==p&&(re=!0),a=d;break;case"name":d!==p&&(re=!0),s=d;break;case"checked":d!==p&&(re=!0),c=d;break;case"defaultChecked":d!==p&&(re=!0),f=d;break;case"value":d!==p&&(re=!0),r=d;break;case"defaultValue":d!==p&&(re=!0),o=d;break;case"children":case"dangerouslySetInnerHTML":if(d!=null)throw Error(Q(137,t));break;default:d!==p&&me(e,t,u,d,i,p)}}cm(e,r,o,l,c,f,a,s);return;case"select":d=r=o=u=null;for(a in n)if(l=n[a],n.hasOwnProperty(a)&&l!=null)switch(a){case"value":break;case"multiple":d=l;default:i.hasOwnProperty(a)||me(e,t,a,null,i,l)}for(s in i)if(a=i[s],l=n[s],i.hasOwnProperty(s)&&(a!=null||l!=null))switch(s){case"value":a!==l&&(re=!0),u=a;break;case"defaultValue":a!==l&&(re=!0),o=a;break;case"multiple":a!==l&&(re=!0),r=a;default:a!==l&&me(e,t,s,a,i,l)}t=o,n=r,i=d,u!=null?Jr(e,!!n,u,!1):!!i!=!!n&&(t!=null?Jr(e,!!n,t,!0):Jr(e,!!n,n?[]:"",!1));return;case"textarea":d=u=null;for(o in n)if(s=n[o],n.hasOwnProperty(o)&&s!=null&&!i.hasOwnProperty(o))switch(o){case"value":break;case"children":break;default:me(e,t,o,null,i,s)}for(r in i)if(s=i[r],a=n[r],i.hasOwnProperty(r)&&(s!=null||a!=null))switch(r){case"value":s!==a&&(re=!0),u=s;break;case"defaultValue":s!==a&&(re=!0),d=s;break;case"children":break;case"dangerouslySetInnerHTML":if(s!=null)throw Error(Q(91));break;default:s!==a&&me(e,t,r,s,i,a)}Ix(e,u,d);return;case"option":for(var v in n)u=n[v],n.hasOwnProperty(v)&&u!=null&&!i.hasOwnProperty(v)&&(v==="selected"?e.selected=!1:me(e,t,v,null,i,u));for(l in i)u=i[l],d=n[l],i.hasOwnProperty(l)&&u!==d&&(u!=null||d!=null)&&(l==="selected"?(u!==d&&(re=!0),e.selected=u&&typeof u!="function"&&typeof u!="symbol"):me(e,t,l,u,i,d));return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var M in n)u=n[M],n.hasOwnProperty(M)&&u!=null&&!i.hasOwnProperty(M)&&me(e,t,M,null,i,u);for(c in i)if(u=i[c],d=n[c],i.hasOwnProperty(c)&&u!==d&&(u!=null||d!=null))switch(c){case"children":case"dangerouslySetInnerHTML":if(u!=null)throw Error(Q(137,t));break;default:me(e,t,c,u,i,d)}return;default:if(dg(t)){for(var _ in n)u=n[_],n.hasOwnProperty(_)&&u!==void 0&&!i.hasOwnProperty(_)&&Qm(e,t,_,void 0,i,u);for(f in i)u=i[f],d=n[f],!i.hasOwnProperty(f)||u===d||u===void 0&&d===void 0||Qm(e,t,f,u,i,d);return}}for(var h in n)u=n[h],n.hasOwnProperty(h)&&u!=null&&!i.hasOwnProperty(h)&&me(e,t,h,null,i,u);for(p in i)u=i[p],d=n[p],!i.hasOwnProperty(p)||u===d||u==null&&d==null||me(e,t,p,u,i,d)}function ky(e){switch(e){case"css":case"script":case"font":case"img":case"image":case"input":case"link":return!0;default:return!1}}function nw(){if(typeof performance.getEntriesByType=="function"){for(var e=0,t=0,n=performance.getEntriesByType("resource"),i=0;i<n.length;i++){var s=n[i],a=s.transferSize,r=s.initiatorType,o=s.duration;if(a&&o&&ky(r)){for(r=0,o=s.responseEnd,i+=1;i<n.length;i++){var l=n[i],c=l.startTime;if(c>o)break;var f=l.transferSize,p=l.initiatorType;f&&ky(p)&&(l=l.responseEnd,r+=f*(l<o?1:(o-c)/(l-c)))}if(--i,t+=8*(a+r)/(s.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e=="number")?e:5}var jm=null,$m=null;function Yl(e){return e.nodeType===9?e:e.ownerDocument}function Xy(e){switch(e){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function VM(e,t){if(e===0)switch(t){case"svg":return 1;case"math":return 2;default:return 0}return e===1&&t==="foreignObject"?0:e}function GM(e,t,n,i){return n=Yl(n).createElement(e),n[pn]=i,n[qn]=t,vn(n,e,t),ln(n),n}function tg(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.children=="bigint"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Zp=null;function iw(){var e=window.event;return e&&e.type==="popstate"?e===Zp?!1:(Zp=e,!0):(Zp=null,!1)}var $g=typeof setTimeout=="function"?setTimeout:void 0,sw=typeof clearTimeout=="function"?clearTimeout:void 0,Wy=typeof Promise=="function"?Promise:void 0,qy=typeof requestAnimationFrame=="function"?requestAnimationFrame:$g,aw=typeof queueMicrotask=="function"?queueMicrotask:typeof Wy<"u"?function(e){return Wy.resolve(null).then(e).catch(rw)}:$g;function rw(e){setTimeout(function(){throw e})}function Ma(e){return e==="head"}function Yy(e,t){var n=t,i=0;do{var s=n.nextSibling;if(e.removeChild(n),s&&s.nodeType===8)if(n=s.data,n==="/$"||n==="/&"){if(i===0){e.removeChild(s),_o(t);return}i--}else if(n==="$"||n==="$?"||n==="$~"||n==="$!"||n==="&")i++;else if(n==="html")Kp(e.ownerDocument.documentElement);else if(n==="head"){n=e.ownerDocument.head,Kp(n);for(var a=n.firstChild;a;){var r=a.nextSibling,o=a.nodeName;a[nc]||o==="SCRIPT"||o==="STYLE"||o==="LINK"&&a.rel.toLowerCase()==="stylesheet"||n.removeChild(a),a=r}}else n==="body"&&Kp(e.ownerDocument.body);n=s}while(n);_o(t)}function Zy(e,t){var n=e;e=0;do{var i=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display="none"):(n.style.display=n._stashedDisplay||"",n.getAttribute("style")===""&&n.removeAttribute("style")):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=""):n.nodeValue=n._stashedText||""),i&&i.nodeType===8)if(n=i.data,n==="/$"){if(e===0)break;e--}else n!=="$"&&n!=="$?"&&n!=="$~"&&n!=="$!"||e++;n=i}while(n)}function kM(e,t,n){if(t=CSS.escape(t)!==t?"r-"+btoa(t).replace(/=/g,""):t,e.style.viewTransitionName=t,n!=null&&(e.style.viewTransitionClass=n),n=getComputedStyle(e),n.display==="inline"){if(t=e.getClientRects(),t.length===1)var i=1;else for(var s=i=0;s<t.length;s++){var a=t[s];0<a.width&&0<a.height&&i++}i===1&&(e=e.style,e.display=t.length===1?"inline-block":"block",e.marginTop="-"+n.paddingTop,e.marginBottom="-"+n.paddingBottom)}}function XM(e,t){e=e.style,t=t.style;var n=t!=null?t.hasOwnProperty("viewTransitionName")?t.viewTransitionName:t.hasOwnProperty("view-transition-name")?t["view-transition-name"]:null:null;e.viewTransitionName=n==null||typeof n=="boolean"?"":(""+n).trim(),n=t!=null?t.hasOwnProperty("viewTransitionClass")?t.viewTransitionClass:t.hasOwnProperty("view-transition-class")?t["view-transition-class"]:null:null,e.viewTransitionClass=n==null||typeof n=="boolean"?"":(""+n).trim(),e.display==="inline-block"&&(t==null?e.display=e.margin="":(n=t.display,e.display=n==null||typeof n=="boolean"?"":n,n=t.margin,n!=null?e.margin=n:(n=t.hasOwnProperty("marginTop")?t.marginTop:t["margin-top"],e.marginTop=n==null||typeof n=="boolean"?"":n,t=t.hasOwnProperty("marginBottom")?t.marginBottom:t["margin-bottom"],e.marginBottom=t==null||typeof t=="boolean"?"":t)))}function WM(e,t,n){return n=n.ownerDocument.defaultView,{rect:e,abs:t.position==="absolute"||t.position==="fixed",clip:t.clipPath!=="none"||t.overflow!=="visible"||t.filter!=="none"||t.mask!=="none"||t.mask!=="none"||t.borderRadius!=="0px",view:0<=e.bottom&&0<=e.right&&e.top<=n.innerHeight&&e.left<=n.innerWidth}}function eg(e){var t=e.getBoundingClientRect(),n=getComputedStyle(e);return WM(t,n,e)}function ow(e){var t=e.getBoundingClientRect();t=new DOMRect(t.x+2e4,t.y+2e4,t.width,t.height);var n=getComputedStyle(e);return WM(t,n,e)}function lw(e){return e.documentElement.clientHeight}function cw(e){this.addEventListener("load",e),this.addEventListener("error",e)}function uw(e,t,n,i,s,a,r,o,l){var c=t.nodeType===9?t:t.ownerDocument;try{var f=c.startViewTransition({update:function(){var u=c.defaultView,d=u.navigation&&u.navigation.transition,v=c.fonts.status;i();var M=[];if(v==="loaded"&&(lw(c),c.fonts.status==="loading"&&M.push(c.fonts.ready)),v=M.length,e!==null)for(var _=e.suspenseyImages,h=0,m=0;m<_.length;m++){var S=_[m];if(!S.complete){var y=S.getBoundingClientRect();if(0<y.bottom&&0<y.right&&y.top<u.innerHeight&&y.left<u.innerWidth){if(h+=ib(S),h>Qu){M.length=v;break}S=new Promise(cw.bind(S)),M.push(S)}}}if(0<M.length)return u=Promise.race([Promise.all(M),new Promise(function(E){return setTimeout(E,500)})]).then(s,s),(d?Promise.allSettled([d.finished,u]):u).then(a,a);if(s(),d)return d.finished.then(a,a);a()},types:n});c.__reactViewTransition=f;var p=[];return f.ready.then(function(){for(var u=c.documentElement.getAnimations({subtree:!0}),d=0;d<u.length;d++){var v=u[d],M=v.effect,_=M.pseudoElement;if(_!=null&&_.startsWith("::view-transition")){p.push(v),v=M.getKeyframes();for(var h=_=void 0,m=!0,S=0;S<v.length;S++){var y=v[S],E=y.width;if(_===void 0)_=E;else if(_!==E){m=!1;break}if(E=y.height,h===void 0)h=E;else if(h!==E){m=!1;break}delete y.width,delete y.height,y.transform==="none"&&delete y.transform}m&&_!==void 0&&h!==void 0&&(M.setKeyframes(v),m=getComputedStyle(M.target,M.pseudoElement),m.width!==_||m.height!==h)&&(m=v[0],m.width=_,m.height=h,m=v[v.length-1],m.width=_,m.height=h,M.setKeyframes(v))}}r()},function(u){c.__reactViewTransition===f&&(c.__reactViewTransition=null);try{typeof u=="object"&&u!==null&&u.name==="InvalidStateError"&&(u.message==="View transition was skipped because document visibility state is hidden."||u.message==="Skipping view transition because document visibility state has become hidden."||u.message==="Skipping view transition because viewport size changed."||u.message==="Transition was aborted because of invalid state")&&(u=null),u!==null&&l(u)}finally{i(),s(),r()}}),f.finished.finally(function(){for(var u=0;u<p.length;u++)p[u].cancel();c.__reactViewTransition===f&&(c.__reactViewTransition=null),o()}),f}catch{return i(),s(),r(),null}}function qa(e,t){this._scope=document.documentElement,this._selector="::view-transition-"+e+"("+t+")"}qa.prototype.animate=function(e,t){return t=typeof t=="number"?{duration:t}:Ee({},t),t.pseudoElement=this._selector,this._scope.animate(e,t)};qa.prototype.getAnimations=function(){for(var e=this._scope,t=this._selector,n=e.getAnimations({subtree:!0}),i=[],s=0;s<n.length;s++){var a=n[s].effect;a!==null&&a.target===e&&a.pseudoElement===t&&i.push(n[s])}return i};qa.prototype.getComputedStyle=function(){return getComputedStyle(this._scope,this._selector)};function qM(e){return{name:e,group:new qa("group",e),imagePair:new qa("image-pair",e),old:new qa("old",e),new:new qa("new",e)}}function ri(e){this._fragmentFiber=e,this._observers=this._eventListeners=null}ri.prototype.addEventListener=function(e,t,n){var i=null,s=null;if(!(n!=null&&typeof n!="boolean"&&(i=n.signal||null,i!==null&&i.aborted))){this._eventListeners===null&&(this._eventListeners=[]);var a=this._eventListeners;if(YM(a,e,t,n)===-1){var r=this,o=t;n!=null&&typeof n!="boolean"&&n.once===!0&&(o=function(l){r.removeEventListener(e,t,n),typeof t=="function"?t.call(this,l):t.handleEvent(l)}),i!==null&&(s=r.removeEventListener.bind(r,e,t,n),i.addEventListener("abort",s,{once:!0}),s=i.removeEventListener.bind(i,"abort",s)),i=fo(n),a.push({type:e,listener:t,optionsOrUseCapture:n,attachedListener:o,cleanup:s}),Wn(this._fragmentFiber.child,!1,hw,e,o,i)}this._eventListeners=a}};function hw(e,t,n,i){return $e(e).addEventListener(t,n,i),!1}ri.prototype.removeEventListener=function(e,t,n){var i=this._eventListeners;if(i!==null&&(t=YM(i,e,t,n),t!==-1)){var s=i[t];n=s.attachedListener;var a=s.cleanup;s=fo(s.optionsOrUseCapture),Wn(this._fragmentFiber.child,!1,fw,e,n,s),i.splice(t,1),a!==null&&a()}};function fw(e,t,n,i){return $e(e).removeEventListener(t,n,i),!1}function fo(e){return e!=null&&typeof e!="boolean"&&(e.once===!0||e.signal instanceof AbortSignal)?{capture:e.capture,passive:e.passive}:e}function Jy(e){return e==null?"c=0":typeof e=="boolean"?"c="+(e?"1":"0"):"c="+(e.capture?"1":"0")}function YM(e,t,n,i){if(e.length===0)return-1;i=Jy(i);for(var s=0;s<e.length;s++){var a=e[s];if(a.type===t&&a.listener===n&&Jy(a.optionsOrUseCapture)===i)return s}return-1}ri.prototype.dispatchEvent=function(e){var t=rr(this._fragmentFiber);if(t===null)return!0;t=$e(t);var n=this._eventListeners;if(n!==null&&0<n.length||!e.bubbles){var i=t.nodeType===9?t.createComment(""):document.createTextNode("");if(n)for(var s=0;s<n.length;s++){var a=n[s];i.addEventListener(a.type,a.attachedListener,fo(a.optionsOrUseCapture))}if(t.appendChild(i),e=i.dispatchEvent(e),n)for(s=0;s<n.length;s++)a=n[s],i.removeEventListener(a.type,a.attachedListener,fo(a.optionsOrUseCapture));return t.removeChild(i),e}return t.dispatchEvent(e)};ri.prototype.focus=function(e){Wn(this._fragmentFiber.child,!0,ZM,e,void 0,void 0)};function ZM(e,t){return e.tag===6?!1:(e=$e(e),Ew(e,t))}ri.prototype.focusLast=function(e){var t=[];Wn(this._fragmentFiber.child,!0,t0,t,void 0,void 0);for(var n=t.length-1;0<=n&&!ZM(t[n],e);n--);};function t0(e,t){return t.push(e),!1}ri.prototype.blur=function(){var e=rr(this._fragmentFiber);e!==null&&(e=$e(e),e=Yl(e).activeElement,e!==null&&Wn(this._fragmentFiber.child,!1,dw,e,void 0,void 0))};function dw(e,t){return e.tag===6?!1:(e=$e(e),e===t||e.contains(t)?(t.blur(),!0):!1)}ri.prototype.observeUsing=function(e){this._observers===null&&(this._observers=new Set),this._observers.add(e),Wn(this._fragmentFiber.child,!1,pw,e,void 0,void 0)};function pw(e,t){return e.tag===6||(e=$e(e),t.observe(e)),!1}ri.prototype.unobserveUsing=function(e){var t=this._observers;if(t!==null&&t.has(e)){t.delete(e),Wn(this._fragmentFiber.child,!1,mw,e,void 0,void 0);for(var n=t=0;n<Ni.length;n++){var i=Ni[n];i.fragmentInstance===this&&i.observer===e?e.unobserve(i.instance):Ni[t++]=i}Ni.length=t}};function mw(e,t){return e.tag===6||(e=$e(e),t.unobserve(e)),!1}var Ni=[],Jp=!1;function gw(e,t,n){Ni.push({fragmentInstance:e,observer:t,instance:n}),Jp||(Jp=!0,Tw(function(){Jp=!1;var i=Ni;Ni=[];for(var s=0;s<i.length;s++){var a=i[s];a.observer.unobserve(a.instance)}}))}ri.prototype.getClientRects=function(){var e=[];return Wn(this._fragmentFiber.child,!1,_w,e,void 0,void 0),e};function _w(e,t){if(e.tag===6){e=e.stateNode;var n=e.ownerDocument.createRange();n.selectNodeContents(e),t.push.apply(t,n.getClientRects())}else e=$e(e),t.push.apply(t,e.getClientRects());return!1}ri.prototype.getRootNode=function(e){var t=rr(this._fragmentFiber);return t===null?this:$e(t).getRootNode(e)};ri.prototype.compareDocumentPosition=function(e){var t=rr(this._fragmentFiber);if(t===null)return Node.DOCUMENT_POSITION_DISCONNECTED;var n=[];Wn(this._fragmentFiber.child,!1,t0,n,void 0,void 0);var i=$e(t);if(n.length===0){if(n=i,Cv(this._fragmentFiber)){t:{for(t=this._fragmentFiber.return;t!==null;){if(t.tag===4){t=t.stateNode.containerInfo;break t}if(t.tag===3||t.tag===5||t.tag===27)break;t=t.return}t=null}t!=null&&(n=t)}t=this._fragmentFiber;var s=i=n.compareDocumentPosition(e);return n===e?s=Node.DOCUMENT_POSITION_CONTAINS:i&Node.DOCUMENT_POSITION_CONTAINED_BY&&(n=gx(t)[1],n===null?s=Node.DOCUMENT_POSITION_PRECEDING:(e=$e(n).compareDocumentPosition(e),s=e===0||e&Node.DOCUMENT_POSITION_FOLLOWING?Node.DOCUMENT_POSITION_FOLLOWING:Node.DOCUMENT_POSITION_PRECEDING)),s|=Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC}t=$e(n[0]),s=$e(n[n.length-1]);var a=Cv(this._fragmentFiber)?t.parentElement:i;if(a==null)return Node.DOCUMENT_POSITION_DISCONNECTED;i=a.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_CONTAINED_BY,a=a.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_CONTAINED_BY;var r=t.compareDocumentPosition(e),o=s.compareDocumentPosition(e),l=r&Node.DOCUMENT_POSITION_CONTAINED_BY||o&Node.DOCUMENT_POSITION_CONTAINED_BY;return o=i&&a&&r&Node.DOCUMENT_POSITION_FOLLOWING&&o&Node.DOCUMENT_POSITION_PRECEDING,t=i&&t===e||a&&s===e||l||o?Node.DOCUMENT_POSITION_CONTAINED_BY:!i&&t===e||!a&&s===e?Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC:r,t&Node.DOCUMENT_POSITION_DISCONNECTED||t&Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC||vw(t,this._fragmentFiber,n[0],n[n.length-1],e)?t:Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC};function vw(e,t,n,i,s){var a=Wa(s);if(e&Node.DOCUMENT_POSITION_CONTAINED_BY){if(n=!!a)t:{for(;a!==null;){if(a.tag===7&&(a===t||a.alternate===t)){n=!0;break t}a=a.return}n=!1}return n}if(e&Node.DOCUMENT_POSITION_CONTAINS){if(a===null)return a=s.ownerDocument,s===a||s===a.documentElement||s===a.body;t:{for(a=t,t=rr(t);a!==null;){if(!(a.tag!==5&&a.tag!==3&&a.tag!==27||a!==t&&a.alternate!==t)){a=!0;break t}a=a.return}a=!1}return a}return e&Node.DOCUMENT_POSITION_PRECEDING?((t=!!a)&&!(t=a===n)&&(t=jp(n,a,Rv),t===null?t=!1:(Wn(t,!0,ZE,a,n),a=Pr,Pr=null,t=a!==null)),t):e&Node.DOCUMENT_POSITION_FOLLOWING?((t=!!a)&&!(t=a===i)&&(t=jp(i,a,Rv),t===null?t=!1:(Wn(t,!0,JE,a,i),a=Pr,Qp=Pr=null,t=a!==null)),t):!1}function Ky(e,t){var n=e.ownerDocument.createRange();n.selectNodeContents(e),e=n.getBoundingClientRect(),window.scrollTo(window.scrollX+e.left,t?window.scrollY+e.top:window.scrollY+e.bottom-window.innerHeight)}ri.prototype.scrollIntoView=function(e){if(typeof e=="object")throw Error(Q(566));var t=[];Wn(this._fragmentFiber.child,!1,t0,t,void 0,void 0);var n=e!==!1;if(t.length===0){var i=gx(this._fragmentFiber);if(i=n?i[1]||i[0]||rr(this._fragmentFiber):i[0]||i[1],i===null)return;if(i.tag===6){e=$e(i),Ky(e,n);return}if(i=$e(i),i.nodeType!==9){if(i.nodeType===11){n="host"in i?i.host:null,n!==null&&n.scrollIntoView(e);return}i.scrollIntoView(e)}}for(i=n?t.length-1:0;i!==(n?-1:t.length);){var s=t[i];s.tag===6?(s=$e(s),Ky(s,n)):$e(s).scrollIntoView(e),i+=n?-1:1}};function yw(e,t){return e=$e(e),JM(e,t),!1}function JM(e,t){e.reactFragments==null&&(e.reactFragments=new Set),e.reactFragments.add(t)}function KM(e,t){var n=t._eventListeners;if(n!==null)for(var i=0;i<n.length;i++){var s=n[i];e.addEventListener(s.type,s.attachedListener,fo(s.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(a){for(var r=0,o=0;o<Ni.length;o++){var l=Ni[o];(l.fragmentInstance!==t||l.observer!==a||l.instance!==e)&&(Ni[r++]=l)}Ni.length=r,a.observe(e)}),JM(e,t))}function xw(e,t){var n=t._eventListeners;if(n!==null)for(var i=0;i<n.length;i++){var s=n[i];e.removeEventListener(s.type,s.attachedListener,fo(s.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(a){typeof a.rootMargin=="string"?gw(t,a,e):a.unobserve(e)}),e.reactFragments!=null&&e.reactFragments.delete(t))}function ng(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case"HTML":case"HEAD":case"BODY":ng(n),Nh(n);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(n.rel.toLowerCase()==="stylesheet")continue}e.removeChild(n)}}function Sw(e,t,n,i){for(;e.nodeType===1;){var s=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!i&&(e.nodeName!=="INPUT"||e.type!=="hidden"))break}else if(i){if(!e[nc])switch(t){case"meta":if(!e.hasAttribute("itemprop"))break;return e;case"link":if(a=e.getAttribute("rel"),a==="stylesheet"&&e.hasAttribute("data-precedence"))break;if(a!==s.rel||e.getAttribute("href")!==(s.href==null||s.href===""?null:s.href)||e.getAttribute("crossorigin")!==(s.crossOrigin==null?null:s.crossOrigin)||e.getAttribute("title")!==(s.title==null?null:s.title))break;return e;case"style":if(e.hasAttribute("data-precedence"))break;return e;case"script":if(a=e.getAttribute("src"),(a!==(s.src==null?null:s.src)||e.getAttribute("type")!==(s.type==null?null:s.type)||e.getAttribute("crossorigin")!==(s.crossOrigin==null?null:s.crossOrigin))&&a&&e.hasAttribute("async")&&!e.hasAttribute("itemprop"))break;return e;default:return e}}else if(t==="input"&&e.type==="hidden"){var a=s.name==null?null:""+s.name;if(s.type==="hidden"&&e.getAttribute("name")===a)return e}else return e;if(e=Mi(e.nextSibling),e===null)break}return null}function Mw(e,t,n){if(t==="")return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!n||(e=Mi(e.nextSibling),e===null))return null;return e}function QM(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!t||(e=Mi(e.nextSibling),e===null))return null;return e}function ig(e){return e.data==="$?"||e.data==="$~"}function e0(e){return e.data==="$!"||e.data==="$?"&&e.ownerDocument.readyState!=="loading"}function bw(e,t){var n=e.ownerDocument;if(e.data==="$~")e._reactRetry=t;else if(e.data!=="$?"||n.readyState!=="loading")t();else{var i=function(){t(),n.removeEventListener("DOMContentLoaded",i)};n.addEventListener("DOMContentLoaded",i),e._reactRetry=i}}function Mi(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?"||t==="$~"||t==="&"||t==="F!"||t==="F")break;if(t==="/$"||t==="/&")return null}}return e}var sg=null;function Qy(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"||n==="/&"){if(t===0)return Mi(e.nextSibling);t--}else n!=="$"&&n!=="$!"&&n!=="$?"&&n!=="$~"&&n!=="&"||t++}e=e.nextSibling}return null}function jy(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"||n==="$~"||n==="&"){if(t===0)return e;t--}else n!=="/$"&&n!=="/&"||t++}e=e.previousSibling}return null}function Ew(e,t){function n(){i=!0}if(e.ownerDocument.activeElement===e)return!0;var i=!1;try{e.ownerDocument.addEventListener("focus",n,!0),(e.focus||HTMLElement.prototype.focus).call(e,t)}finally{e.ownerDocument.removeEventListener("focus",n,!0)}return i}function Tw(e){qy(function(){qy(function(t){return e(t)})})}function jM(e,t,n){switch(t=Yl(n),e){case"html":if(e=t.documentElement,!e)throw Error(Q(452));return e;case"head":if(e=t.head,!e)throw Error(Q(453));return e;case"body":if(e=t.body,!e)throw Error(Q(454));return e;default:throw Error(Q(451))}}function $M(e,t,n){for(var i in n){var s=n[i];n.hasOwnProperty(i)&&s!=null&&me(e,t,i,null,tw,s)}n.dangerouslySetInnerHTML!=null&&(e.textContent=""),e.onclick===ji&&(e.onclick=null),Nh(e)}function Kp(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);Nh(e)}var bi=new Map,$y=new Set;function Zl(e){if(typeof e.getRootNode=="function"){var t=e.getRootNode();if(t.nodeType===9||t.nodeType===11)return t}return e.nodeType===9?e:e.ownerDocument}var Us=ce.d;ce.d={f:Aw,r:ww,D:Cw,C:Rw,L:Nw,m:Dw,X:Lw,S:Uw,M:Ow};function Aw(){var e=Us.f(),t=Xh();return e||t}function ww(e){var t=yo(e);t!==null&&t.tag===5&&t.type==="form"?BS(t):Us.r(e)}var bo=typeof document>"u"?null:document;function tb(e,t,n){var i=bo;if(i&&typeof t=="string"&&t){var s=yi(t);s='link[rel="'+e+'"][href="'+s+'"]',typeof n=="string"&&(s+='[crossorigin="'+n+'"]'),$y.has(s)||($y.add(s),e={rel:e,crossOrigin:n,href:t},i.querySelector(s)===null&&(t=i.createElement("link"),vn(t,"link",e),ln(t),i.head.appendChild(t)))}}function Cw(e){Us.D(e),tb("dns-prefetch",e,null)}function Rw(e,t){Us.C(e,t),tb("preconnect",e,t)}function Nw(e,t,n){Us.L(e,t,n);var i=bo;if(i&&e&&t){var s='link[rel="preload"][as="'+yi(t)+'"]';t==="image"&&n&&n.imageSrcSet?(s+='[imagesrcset="'+yi(n.imageSrcSet)+'"]',typeof n.imageSizes=="string"&&(s+='[imagesizes="'+yi(n.imageSizes)+'"]')):s+='[href="'+yi(e)+'"]';var a=s;switch(t){case"style":a=po(e);break;case"script":a=Eo(e)}if(!(bi.has(a)||(e=Ee({rel:"preload",href:t==="image"&&n&&n.imageSrcSet?void 0:e,as:t},n),bi.set(a,e),i.querySelector(s)!==null||t==="style"&&i.querySelector(lc(a))||t==="script"&&i.querySelector(cc(a))))){var r=i.createElement("link");vn(r,"link",e),t==="style"&&(r[sh]=!0,r.onload=r.onerror=function(){Rx(r)}),ln(r),i.head.appendChild(r)}}}function Dw(e,t){Us.m(e,t);var n=bo;if(n&&e){var i=t&&typeof t.as=="string"?t.as:"script",s='link[rel="modulepreload"][as="'+yi(i)+'"][href="'+yi(e)+'"]',a=s;switch(i){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":a=Eo(e)}if(!bi.has(a)&&(e=Ee({rel:"modulepreload",href:e},t),bi.set(a,e),n.querySelector(s)===null)){switch(i){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(n.querySelector(cc(a)))return}i=n.createElement("link"),vn(i,"link",e),ln(i),n.head.appendChild(i)}}}function Uw(e,t,n){Us.S(e,t,n);var i=bo;if(i&&e){var s=Zr(i).hoistableStyles,a=po(e);t=t||"default";var r=s.get(a);if(!r){var o={loading:0,preload:null};if(r=i.querySelector(lc(a)))o.loading=5;else{e=Ee({rel:"stylesheet",href:e,"data-precedence":t},n),(n=bi.get(a))&&n0(e,n);var l=r=i.createElement("link");ln(l),vn(l,"link",e),l._p=new Promise(function(c,f){l.onload=c,l.onerror=f}),l.addEventListener("load",function(){o.loading|=1}),l.addEventListener("error",function(){o.loading|=2}),o.loading|=4,Ju(r,t,i)}r={type:"stylesheet",instance:r,count:1,state:o},s.set(a,r)}}}function Lw(e,t){Us.X(e,t);var n=bo;if(n&&e){var i=Zr(n).hoistableScripts,s=Eo(e),a=i.get(s);a||(a=n.querySelector(cc(s)),a||(e=Ee({src:e,async:!0},t),(t=bi.get(s))&&i0(e,t),a=n.createElement("script"),ln(a),vn(a,"link",e),n.head.appendChild(a)),a={type:"script",instance:a,count:1,state:null},i.set(s,a))}}function Ow(e,t){Us.M(e,t);var n=bo;if(n&&e){var i=Zr(n).hoistableScripts,s=Eo(e),a=i.get(s);a||(a=n.querySelector(cc(s)),a||(e=Ee({src:e,async:!0,type:"module"},t),(t=bi.get(s))&&i0(e,t),a=n.createElement("script"),ln(a),vn(a,"link",e),n.head.appendChild(a)),a={type:"script",instance:a,count:1,state:null},i.set(s,a))}}function tx(e,t,n,i){var s=(s=ra.current)?Zl(s):null;if(!s)throw Error(Q(446));switch(e){case"meta":case"title":return null;case"style":return typeof n.precedence=="string"&&typeof n.href=="string"?(n=po(n.href),t=Zr(s).hoistableStyles,i=t.get(n),i||(i={type:"style",instance:null,count:0,state:null},t.set(n,i)),i):{type:"void",instance:null,count:0,state:null};case"link":if(n.rel==="stylesheet"&&typeof n.href=="string"&&typeof n.precedence=="string"){e=po(n.href);var a=Zr(s).hoistableStyles,r=a.get(e);if(r||(s=s.ownerDocument||s,r={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},a.set(e,r),(a=s.querySelector(lc(e)))?a._p||(r.instance=a,r.state.loading=5):(a=bi.get(e),a||(a={rel:"preload",as:"style",href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},bi.set(e,a)),Iw(s,e,a,r.state))),t&&i===null)throw Error(Q(528,""));return r}if(t&&i!==null)throw Error(Q(529,""));return null;case"script":return t=n.async,n=n.src,typeof n=="string"&&t&&typeof t!="function"&&typeof t!="symbol"?(n=Eo(n),t=Zr(s).hoistableScripts,i=t.get(n),i||(i={type:"script",instance:null,count:0,state:null},t.set(n,i)),i):{type:"void",instance:null,count:0,state:null};default:throw Error(Q(444,e))}}function po(e){return'href="'+yi(e)+'"'}function lc(e){return'link[rel="stylesheet"]['+e+"]"}function eb(e){return Ee({},e,{"data-precedence":e.precedence,precedence:null})}function Iw(e,t,n,i){if(t=e.querySelector('link[rel="preload"][as="style"]['+t+"]")){if(t[sh]!==!0){i.loading=1;return}}else t=e.createElement("link"),t[sh]=!0,t.onload=t.onerror=Rx.bind(null,t),vn(t,"link",n),ln(t),e.head.appendChild(t);i.preload=t,t.addEventListener("load",function(){return i.loading|=1}),t.addEventListener("error",function(){return i.loading|=2})}function Eo(e){return'[src="'+yi(e)+'"]'}function cc(e){return"script[async]"+e}function ex(e,t,n){if(t.count++,t.instance===null)switch(t.type){case"style":var i=e.querySelector('style[data-href~="'+yi(n.href)+'"]');if(i)return t.instance=i,ln(i),i;var s=Ee({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return i=(e.ownerDocument||e).createElement("style"),ln(i),vn(i,"style",s),Ju(i,n.precedence,e),t.instance=i;case"stylesheet":s=po(n.href);var a=e.querySelector(lc(s));if(a)return t.state.loading|=4,t.instance=a,ln(a),a;i=eb(n),(s=bi.get(s))&&n0(i,s),a=(e.ownerDocument||e).createElement("link"),ln(a);var r=a;return r._p=new Promise(function(o,l){r.onload=o,r.onerror=l}),vn(a,"link",i),t.state.loading|=4,Ju(a,n.precedence,e),t.instance=a;case"script":return a=Eo(n.src),(s=e.querySelector(cc(a)))?(t.instance=s,ln(s),s):(i=n,(s=bi.get(a))&&(i=Ee({},n),i0(i,s)),e=e.ownerDocument||e,s=e.createElement("script"),ln(s),vn(s,"link",i),e.head.appendChild(s),t.instance=s);case"void":return null;default:throw Error(Q(443,t.type))}else t.type==="stylesheet"&&(t.state.loading&4)===0&&(i=t.instance,t.state.loading|=4,Ju(i,n.precedence,e));return t.instance}function Ju(e,t,n){for(var i=n.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),s=i.length?i[i.length-1]:null,a=s,r=0;r<i.length;r++){var o=i[r];if(o.dataset.precedence===t)a=o;else if(a!==s)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function n0(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.title==null&&(e.title=t.title)}function i0(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.integrity==null&&(e.integrity=t.integrity)}var Ku=null;function nx(e,t,n){if(Ku===null){var i=new Map,s=Ku=new Map;s.set(n,i)}else s=Ku,i=s.get(n),i||(i=new Map,s.set(n,i));if(i.has(e))return i;for(i.set(e,null),n=n.getElementsByTagName(e),s=0;s<n.length;s++){var a=n[s];if(!(a[nc]||a[pn]||e==="link"&&a.getAttribute("rel")==="stylesheet")&&a.namespaceURI!=="http://www.w3.org/2000/svg"){var r=a.getAttribute(t)||"";r=e+r;var o=i.get(r);o?o.push(a):i.set(r,[a])}}return i}function ag(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t==="title"?e.querySelector("head > title"):null)}function Pw(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case"meta":case"title":return!0;case"style":if(typeof t.precedence!="string"||typeof t.href!="string"||t.href==="")break;return!0;case"link":if(typeof t.rel!="string"||typeof t.href!="string"||t.href===""||t.onLoad||t.onError)break;return t.rel==="stylesheet"?(e=t.disabled,typeof t.precedence=="string"&&e==null):!0;case"script":if(t.async&&typeof t.async!="function"&&typeof t.async!="symbol"&&!t.onLoad&&!t.onError&&t.src&&typeof t.src=="string")return!0}return!1}function ix(e,t){return e==="img"&&t.src!=null&&t.src!==""&&t.onLoad==null&&t.loading!=="lazy"}function nb(e){return!(e.type==="stylesheet"&&(e.state.loading&3)===0)}function ib(e){return(e.width||100)*(e.height||100)*(typeof devicePixelRatio=="number"?devicePixelRatio:1)*.25}function sx(e,t){typeof t.decode=="function"&&(e.imgCount++,t.complete||(e.imgBytes+=ib(t),e.suspenseyImages.push(t)),e=Fw.bind(e),t.decode().then(e,e))}function Bw(e,t,n,i){if(n.type==="stylesheet"&&(typeof i.media!="string"||matchMedia(i.media).matches!==!1)&&(n.state.loading&4)===0){if(n.instance===null){var s=po(i.href),a=t.querySelector(lc(s));if(a){t=a._p,t!==null&&typeof t=="object"&&typeof t.then=="function"&&(e.count++,e=Jl.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,ln(a);return}a=t.ownerDocument||t,i=eb(i),(s=bi.get(s))&&n0(i,s),a=a.createElement("link"),ln(a);var r=a;r._p=new Promise(function(o,l){r.onload=o,r.onerror=l}),vn(a,"link",i),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&(n.state.loading&3)===0&&(e.count++,n=Jl.bind(e),t.addEventListener("load",n),t.addEventListener("error",n))}}var Qu=0;function zw(e,t){return e.stylesheets&&e.count===0&&ju(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var i=setTimeout(function(){if(e.stylesheets&&ju(e,e.stylesheets),e.unsuspend){var a=e.unsuspend;e.unsuspend=null,a()}},6e4+t);0<e.imgBytes&&Qu===0&&(Qu=62500*nw());var s=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&ju(e,e.stylesheets),e.unsuspend)){var a=e.unsuspend;e.unsuspend=null,a()}},(e.imgBytes>Qu?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(i),clearTimeout(s)}}:null}function sb(e){if(e.count===0&&(e.imgCount===0||!e.waitingForImages)){if(e.stylesheets)ju(e,e.stylesheets);else if(e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}}}function Jl(){this.count--,sb(this)}function Fw(){this.imgCount--,sb(this)}var wh=null;function ju(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,wh=new Map,t.forEach(Hw,e),wh=null,Jl.call(e))}function Hw(e,t){if(!(t.state.loading&4)){var n=wh.get(e);if(n)var i=n.get(null);else{n=new Map,wh.set(e,n);for(var s=e.querySelectorAll("link[data-precedence],style[data-precedence]"),a=0;a<s.length;a++){var r=s[a];(r.nodeName==="LINK"||r.getAttribute("media")!=="not all")&&(n.set(r.dataset.precedence,r),i=r)}i&&n.set(null,i)}s=t.instance,r=s.getAttribute("data-precedence"),a=n.get(r)||i,a===i&&n.set(null,s),n.set(r,s),this.count++,i=Jl.bind(this),s.addEventListener("load",i),s.addEventListener("error",i),a?a.parentNode.insertBefore(s,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(s,e.firstChild)),t.state.loading|=4}}var mo={$$typeof:Qi,Provider:null,Consumer:null,_currentValue:Ya,_currentValue2:Ya,_threadCount:0};function Vw(e,t,n,i,s,a,r,o,l){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=Ep(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Ep(0),this.hiddenUpdates=Ep(null),this.identifierPrefix=i,this.onUncaughtError=s,this.onCaughtError=a,this.onRecoverableError=r,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=l,this.transitionTypes=null,this.incompleteTransitions=new Map}function ab(e,t,n,i,s,a,r,o,l,c,f,p){return e=new Vw(e,t,n,r,l,c,f,p,o),t=1,a===!0&&(t|=24),a=kn(3,null,null,t),e.current=a,a.stateNode=e,t=bg(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:i,isDehydrated:n,cache:t},Ag(a),e}function rb(e){return e?(e=Xr,e):Xr}function ob(e,t,n,i,s,a){s=rb(s),i.context===null?i.context=s:i.pendingContext=s,i=la(t),i.payload={element:n},a=a===void 0?null:a,a!==null&&(i.callback=a),n=ca(e,i,t),n!==null&&(Xn(n,e,t),wl(n,e,t))}function ax(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function s0(e,t){ax(e,t),(e=e.alternate)&&ax(e,t)}function lb(e){if(e.tag===13||e.tag===31){var t=cr(e,67108864);t!==null&&Xn(t,e,67108864),s0(e,67108864)}}function rx(e){if(e.tag===13||e.tag===31){var t=si();t=hg(t);var n=cr(e,t);n!==null&&Xn(n,e,t),s0(e,t)}}var go=!0;function Gw(e,t,n,i){var s=Lt.T;Lt.T=null;var a=ce.p;try{ce.p=2,a0(e,t,n,i)}finally{ce.p=a,Lt.T=s}}function kw(e,t,n,i){var s=Lt.T;Lt.T=null;var a=ce.p;try{ce.p=8,a0(e,t,n,i)}finally{ce.p=a,Lt.T=s}}function a0(e,t,n,i){if(go){var s=rg(i);if(s===null)Yp(e,t,i,Ch,n),ox(e,i);else if(Ww(s,e,t,n,i))i.stopPropagation();else if(ox(e,i),t&4&&-1<Xw.indexOf(e)){for(;s!==null;){var a=yo(s);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var r=Ga(a.pendingLanes);if(r!==0){var o=a;for(o.pendingLanes|=2,o.entangledLanes|=2;r;){var l=1<<31-ii(r);o.entanglements[1]|=l,r&=~l}as(a),(le&6)===0&&(Mh=ei()+500,oc(0,!1))}}break;case 31:case 13:o=cr(a,2),o!==null&&Xn(o,a,2),Xh(),s0(a,2)}if(a=rg(i),a===null&&Yp(e,t,i,Ch,n),a===s)break;s=a}s!==null&&i.stopPropagation()}else Yp(e,t,i,null,n)}}function rg(e){return e=pg(e),r0(e)}var Ch=null;function r0(e){if(Ch=null,e=Wa(e),e!==null){var t=jl(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=dx(t),e!==null)return e;e=null}else if(n===31){if(e=px(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return Ch=e,null}function cb(e){switch(e){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"fullscreenerror":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"resize":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(sT()){case xx:return 2;case Sx:return 8;case ih:case aT:return 32;case Mx:return 268435456;default:return 32}default:return 32}}var og=!1,da=null,pa=null,ma=null,Kl=new Map,Ql=new Map,$s=[],Xw="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function ox(e,t){switch(e){case"focusin":case"focusout":da=null;break;case"dragenter":case"dragleave":pa=null;break;case"mouseover":case"mouseout":ma=null;break;case"pointerover":case"pointerout":Kl.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":Ql.delete(t.pointerId)}}function gl(e,t,n,i,s,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:i,nativeEvent:a,targetContainers:[s]},t!==null&&(t=yo(t),t!==null&&lb(t)),e):(e.eventSystemFlags|=i,t=e.targetContainers,s!==null&&t.indexOf(s)===-1&&t.push(s),e)}function Ww(e,t,n,i,s){switch(t){case"focusin":return da=gl(da,e,t,n,i,s),!0;case"dragenter":return pa=gl(pa,e,t,n,i,s),!0;case"mouseover":return ma=gl(ma,e,t,n,i,s),!0;case"pointerover":var a=s.pointerId;return Kl.set(a,gl(Kl.get(a)||null,e,t,n,i,s)),!0;case"gotpointercapture":return a=s.pointerId,Ql.set(a,gl(Ql.get(a)||null,e,t,n,i,s)),!0}return!1}function ub(e){var t=Wa(e.target);if(t!==null){var n=jl(t);if(n!==null){if(t=n.tag,t===13){if(t=dx(n),t!==null){e.blockedOn=t,Lv(e.priority,function(){rx(n)});return}}else if(t===31){if(t=px(n),t!==null){e.blockedOn=t,Lv(e.priority,function(){rx(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function $u(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=rg(e.nativeEvent);if(n===null){n=e.nativeEvent;var i=new n.constructor(n.type,n);um=i,n.target.dispatchEvent(i),um=null}else return t=yo(n),t!==null&&lb(t),e.blockedOn=n,!1;t.shift()}return!0}function lx(e,t,n){$u(e)&&n.delete(t)}function qw(){og=!1,da!==null&&$u(da)&&(da=null),pa!==null&&$u(pa)&&(pa=null),ma!==null&&$u(ma)&&(ma=null),Kl.forEach(lx),Ql.forEach(lx)}function Lu(e,t){e.blockedOn===t&&(e.blockedOn=null,og||(og=!0,tn.unstable_scheduleCallback(tn.unstable_NormalPriority,qw)))}var Ou=null;function cx(e){Ou!==e&&(Ou=e,tn.unstable_scheduleCallback(tn.unstable_NormalPriority,function(){Ou===e&&(Ou=null);for(var t=0;t<e.length;t+=3){var n=e[t],i=e[t+1],s=e[t+2];if(typeof i!="function"){if(r0(i||n)===null)continue;break}var a=yo(n);a!==null&&(e.splice(t,3),t-=3,Am(a,{pending:!0,data:s,method:n.method,action:i},i,s))}}))}function _o(e){function t(l){return Lu(l,e)}da!==null&&Lu(da,e),pa!==null&&Lu(pa,e),ma!==null&&Lu(ma,e),Kl.forEach(t),Ql.forEach(t);for(var n=0;n<$s.length;n++){var i=$s[n];i.blockedOn===e&&(i.blockedOn=null)}for(;0<$s.length&&(n=$s[0],n.blockedOn===null);)ub(n),n.blockedOn===null&&$s.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(i=0;i<n.length;i+=3){var s=n[i],a=n[i+1],r=s[qn]||null;if(typeof a=="function")r||cx(n);else if(r){var o=null;if(a&&a.hasAttribute("formAction")){if(s=a,r=a[qn]||null)o=r.formAction;else if(r0(s)!==null)continue}else o=r.action;typeof o=="function"?n[i+1]=o:(n.splice(i,3),i-=3),cx(n)}}}function hb(){function e(a){a.canIntercept&&a.info==="react-transition"&&a.intercept({handler:function(){return new Promise(function(r){return s=r})},focusReset:"manual",scroll:"manual"})}function t(){s!==null&&(s(),s=null),i||setTimeout(n,20)}function n(){if(!i&&!navigation.transition){var a=navigation.currentEntry;a&&a.url!=null&&navigation.navigate(a.url,{state:a.getState(),info:"react-transition",history:"replace"})}}if(typeof navigation=="object"){var i=!1,s=null;return navigation.addEventListener("navigate",e),navigation.addEventListener("navigatesuccess",t),navigation.addEventListener("navigateerror",t),setTimeout(n,100),function(){i=!0,navigation.removeEventListener("navigate",e),navigation.removeEventListener("navigatesuccess",t),navigation.removeEventListener("navigateerror",t),s!==null&&(s(),s=null)}}}function o0(e){this._internalRoot=e}Yh.prototype.render=o0.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(Q(409));var n=t.current,i=si();ob(n,i,e,t,null,null)};Yh.prototype.unmount=o0.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;ob(e.current,2,null,e,null,null),Xh(),t[vo]=null}};function Yh(e){this._internalRoot=e}Yh.prototype.unstable_scheduleHydration=function(e){if(e){var t=Cx();e={blockedOn:null,target:e,priority:t};for(var n=0;n<$s.length&&t!==0&&t<$s[n].priority;n++);$s.splice(n,0,e),n===0&&ub(e)}};var ux=hx.version;if(ux!=="19.3.0")throw Error(Q(527,ux,"19.3.0"));ce.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(Q(188)):(e=Object.keys(e).join(","),Error(Q(268,e)));return e=YE(t),e=e!==null?mx(e):null,e=e===null?null:e.stateNode,e};var Yw={bundleType:0,version:"19.3.0",rendererPackageName:"react-dom",currentDispatcherRef:Lt,reconcilerVersion:"19.3.0"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(_l=__REACT_DEVTOOLS_GLOBAL_HOOK__,!_l.isDisabled&&_l.supportsFiber))try{$l=_l.inject(Yw),ni=_l}catch{}var _l;Zh.createRoot=function(e,t){if(!fx(e))throw Error(Q(299));var n=!1,i="",s=WS,a=qS,r=YS;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(i=t.identifierPrefix),t.onUncaughtError!==void 0&&(s=t.onUncaughtError),t.onCaughtError!==void 0&&(a=t.onCaughtError),t.onRecoverableError!==void 0&&(r=t.onRecoverableError)),t=ab(e,1,!1,null,null,n,i,null,s,a,r,hb),e[vo]=t.current,jg(e),new o0(t)};Zh.hydrateRoot=function(e,t,n){if(!fx(e))throw Error(Q(299));var i=!1,s="",a=WS,r=qS,o=YS,l=null;return n!=null&&(n.unstable_strictMode===!0&&(i=!0),n.identifierPrefix!==void 0&&(s=n.identifierPrefix),n.onUncaughtError!==void 0&&(a=n.onUncaughtError),n.onCaughtError!==void 0&&(r=n.onCaughtError),n.onRecoverableError!==void 0&&(o=n.onRecoverableError),n.formState!==void 0&&(l=n.formState)),t=ab(e,1,!0,t,n??null,i,s,l,a,r,o,hb),t.context=rb(null),n=t.current,i=si(),i=hg(i),s=la(i),s.callback=null,ca(n,s,i),n=i,t.current.lanes=n,ec(t,n),as(t),e[vo]=t.current,jg(e),new Yh(t)};Zh.version="19.3.0"});var mb=Ws((UD,pb)=>{"use strict";function db(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(db)}catch(e){console.error(e)}}db(),pb.exports=fb()});var qe=Z_(cu(),1),uE=Z_(mb(),1);var kb=0,V0=1,Xb=2;var Yc=1,Wb=2,tl=3,Oa=0,Fn=1,ds=2,ps=0,el=1,G0=2,k0=3,X0=4,qb=5;var yr=100,Yb=101,Zb=102,Jb=103,Kb=104,Qb=200,jb=201,$b=202,t1=203,W0=204,q0=205,e1=206,n1=207,i1=208,s1=209,a1=210,r1=211,o1=212,l1=213,c1=214,Mf=0,bf=1,Ef=2,ko=3,Tf=4,Af=5,wf=6,Cf=7,Y0=0,u1=1,h1=2,zi=0,Z0=1,J0=2,K0=3,Q0=4,j0=5,$0=6,t_=7;var e_=300,Ia=301,xr=302,rd=303,od=304,Zc=306,Rf=1e3,ls=1001,Nf=1002,hn=1003,f1=1004;var Jc=1005;var Mn=1006,ld=1007;var Pa=1008;var Jn=1009,n_=1010,i_=1011,nl=1012,cd=1013,Fi=1014,Hi=1015,Vi=1016,ud=1017,hd=1018,il=1020,s_=35902,a_=35899,r_=1021,o_=1022,Ti=1023,cs=1026,Ba=1027,l_=1028,fd=1029,za=1030,dd=1031;var pd=1033,Kc=33776,Qc=33777,jc=33778,$c=33779,md=35840,gd=35841,_d=35842,vd=35843,yd=36196,xd=37492,Sd=37496,Md=37488,bd=37489,tu=37490,Ed=37491,Td=37808,Ad=37809,wd=37810,Cd=37811,Rd=37812,Nd=37813,Dd=37814,Ud=37815,Ld=37816,Od=37817,Id=37818,Pd=37819,Bd=37820,zd=37821,Fd=36492,Hd=36494,Vd=36495,Gd=36283,kd=36284,eu=36285,Xd=36286;var vc=2300,Df=2301,xf=2302,L0=2303,O0=2400,I0=2401,P0=2402;var d1=3200;var Wd=0,p1=1,Vs="",ci="srgb",yc="srgb-linear",xc="linear",de="srgb";var Sf=7680;var m1=519,g1=512,_1=513,v1=514,qd=515,y1=516,x1=517,Yd=518,S1=519,c_=35044;var u_="300 es",Bi=2e3,Xo=2001;function Zw(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function Jw(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Sc(e){return document.createElementNS("http://www.w3.org/1999/xhtml",e)}function M1(){let e=Sc("canvas");return e.style.display="block",e}var gb={},Wo=null;function Mc(...e){let t="THREE."+e.shift();Wo?Wo("log",t,...e):console.log(t,...e)}function b1(e){let t=e[0];if(typeof t=="string"&&t.startsWith("TSL:")){let n=e[1];n&&n.isStackTrace?e[0]+=" "+n.getLocation():e[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return e}function Dt(...e){e=b1(e);let t="THREE."+e.shift();if(Wo)Wo("warn",t,...e);else{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function Ut(...e){e=b1(e);let t="THREE."+e.shift();if(Wo)Wo("error",t,...e);else{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function mr(...e){let t=e.join(" ");t in gb||(gb[t]=!0,Dt(...e))}function E1(e,t,n){return new Promise(function(i,s){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:s();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:i()}}setTimeout(a,n)})}var T1={[Mf]:bf,[Ef]:wf,[Tf]:Cf,[ko]:Af,[bf]:Mf,[wf]:Ef,[Cf]:Tf,[Af]:ko},us=class{addEventListener(t,n){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[t]===void 0&&(i[t]=[]),i[t].indexOf(n)===-1&&i[t].push(n)}hasEventListener(t,n){let i=this._listeners;return i===void 0?!1:i[t]!==void 0&&i[t].indexOf(n)!==-1}removeEventListener(t,n){let i=this._listeners;if(i===void 0)return;let s=i[t];if(s!==void 0){let a=s.indexOf(n);a!==-1&&s.splice(a,1)}}dispatchEvent(t){let n=this._listeners;if(n===void 0)return;let i=n[t.type];if(i!==void 0){t.target=this;let s=i.slice(0);for(let a=0,r=s.length;a<r;a++)s[a].call(this,t);t.target=null}}},Cn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var l0=Math.PI/180,Uf=180/Math.PI;function Ca(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(Cn[e&255]+Cn[e>>8&255]+Cn[e>>16&255]+Cn[e>>24&255]+"-"+Cn[t&255]+Cn[t>>8&255]+"-"+Cn[t>>16&15|64]+Cn[t>>24&255]+"-"+Cn[n&63|128]+Cn[n>>8&255]+"-"+Cn[n>>16&255]+Cn[n>>24&255]+Cn[i&255]+Cn[i>>8&255]+Cn[i>>16&255]+Cn[i>>24&255]).toLowerCase()}function ee(e,t,n){return Math.max(t,Math.min(n,e))}function Kw(e,t){return(e%t+t)%t}function c0(e,t,n){return(1-n)*e+n*t}function os(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:case Uint8ClampedArray:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function xe(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var m_=class m_{constructor(t=0,n=0){this.x=t,this.y=n}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,n){return this.x=t,this.y=n,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let n=this.x,i=this.y,s=t.elements;return this.x=s[0]*n+s[3]*i+s[6],this.y=s[1]*n+s[4]*i+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,n){return this.x=ee(this.x,t.x,n.x),this.y=ee(this.y,t.y,n.y),this}clampScalar(t,n){return this.x=ee(this.x,t,n),this.y=ee(this.y,t,n),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(ee(i,t,n))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let n=Math.sqrt(this.lengthSq()*t.lengthSq());if(n===0)return Math.PI/2;let i=this.dot(t)/n;return Math.acos(ee(i,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let n=this.x-t.x,i=this.y-t.y;return n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this}rotateAround(t,n){let i=Math.cos(n),s=Math.sin(n),a=this.x-t.x,r=this.y-t.y;return this.x=a*i-r*s+t.x,this.y=a*s+r*i+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};m_.prototype.isVector2=!0;var It=m_,hs=class{constructor(t=0,n=0,i=0,s=1){this.isQuaternion=!0,this._x=t,this._y=n,this._z=i,this._w=s}static slerpFlat(t,n,i,s,a,r,o){let l=i[s+0],c=i[s+1],f=i[s+2],p=i[s+3],u=a[r+0],d=a[r+1],v=a[r+2],M=a[r+3];if(p!==M||l!==u||c!==d||f!==v){let _=l*u+c*d+f*v+p*M;_<0&&(u=-u,d=-d,v=-v,M=-M,_=-_);let h=1-o;if(_<.9995){let m=Math.acos(_),S=Math.sin(m);h=Math.sin(h*m)/S,o=Math.sin(o*m)/S,l=l*h+u*o,c=c*h+d*o,f=f*h+v*o,p=p*h+M*o}else{l=l*h+u*o,c=c*h+d*o,f=f*h+v*o,p=p*h+M*o;let m=1/Math.sqrt(l*l+c*c+f*f+p*p);l*=m,c*=m,f*=m,p*=m}}t[n]=l,t[n+1]=c,t[n+2]=f,t[n+3]=p}static multiplyQuaternionsFlat(t,n,i,s,a,r){let o=i[s],l=i[s+1],c=i[s+2],f=i[s+3],p=a[r],u=a[r+1],d=a[r+2],v=a[r+3];return t[n]=o*v+f*p+l*d-c*u,t[n+1]=l*v+f*u+c*p-o*d,t[n+2]=c*v+f*d+o*u-l*p,t[n+3]=f*v-o*p-l*u-c*d,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,n,i,s){return this._x=t,this._y=n,this._z=i,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,n=!0){let i=t._x,s=t._y,a=t._z,r=t._order,o=Math.cos,l=Math.sin,c=o(i/2),f=o(s/2),p=o(a/2),u=l(i/2),d=l(s/2),v=l(a/2);switch(r){case"XYZ":this._x=u*f*p+c*d*v,this._y=c*d*p-u*f*v,this._z=c*f*v+u*d*p,this._w=c*f*p-u*d*v;break;case"YXZ":this._x=u*f*p+c*d*v,this._y=c*d*p-u*f*v,this._z=c*f*v-u*d*p,this._w=c*f*p+u*d*v;break;case"ZXY":this._x=u*f*p-c*d*v,this._y=c*d*p+u*f*v,this._z=c*f*v+u*d*p,this._w=c*f*p-u*d*v;break;case"ZYX":this._x=u*f*p-c*d*v,this._y=c*d*p+u*f*v,this._z=c*f*v-u*d*p,this._w=c*f*p+u*d*v;break;case"YZX":this._x=u*f*p+c*d*v,this._y=c*d*p+u*f*v,this._z=c*f*v-u*d*p,this._w=c*f*p-u*d*v;break;case"XZY":this._x=u*f*p-c*d*v,this._y=c*d*p-u*f*v,this._z=c*f*v+u*d*p,this._w=c*f*p+u*d*v;break;default:Dt("Quaternion: .setFromEuler() encountered an unknown order: "+r)}return n===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,n){let i=n/2,s=Math.sin(i);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(t){let n=t.elements,i=n[0],s=n[4],a=n[8],r=n[1],o=n[5],l=n[9],c=n[2],f=n[6],p=n[10],u=i+o+p;if(u>0){let d=.5/Math.sqrt(u+1);this._w=.25/d,this._x=(f-l)*d,this._y=(a-c)*d,this._z=(r-s)*d}else if(i>o&&i>p){let d=2*Math.sqrt(1+i-o-p);this._w=(f-l)/d,this._x=.25*d,this._y=(s+r)/d,this._z=(a+c)/d}else if(o>p){let d=2*Math.sqrt(1+o-i-p);this._w=(a-c)/d,this._x=(s+r)/d,this._y=.25*d,this._z=(l+f)/d}else{let d=2*Math.sqrt(1+p-i-o);this._w=(r-s)/d,this._x=(a+c)/d,this._y=(l+f)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(t,n){let i=t.dot(n)+1;return i<1e-8?(i=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=i):(this._x=0,this._y=-t.z,this._z=t.y,this._w=i)):(this._x=t.y*n.z-t.z*n.y,this._y=t.z*n.x-t.x*n.z,this._z=t.x*n.y-t.y*n.x,this._w=i),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(ee(this.dot(t),-1,1)))}rotateTowards(t,n){let i=this.angleTo(t);if(i===0)return this;let s=Math.min(1,n/i);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,n){let i=t._x,s=t._y,a=t._z,r=t._w,o=n._x,l=n._y,c=n._z,f=n._w;return this._x=i*f+r*o+s*c-a*l,this._y=s*f+r*l+a*o-i*c,this._z=a*f+r*c+i*l-s*o,this._w=r*f-i*o-s*l-a*c,this._onChangeCallback(),this}slerp(t,n){let i=t._x,s=t._y,a=t._z,r=t._w,o=this.dot(t);o<0&&(i=-i,s=-s,a=-a,r=-r,o=-o);let l=1-n;if(o<.9995){let c=Math.acos(o),f=Math.sin(c);l=Math.sin(l*c)/f,n=Math.sin(n*c)/f,this._x=this._x*l+i*n,this._y=this._y*l+s*n,this._z=this._z*l+a*n,this._w=this._w*l+r*n,this._onChangeCallback()}else this._x=this._x*l+i*n,this._y=this._y*l+s*n,this._z=this._z*l+a*n,this._w=this._w*l+r*n,this.normalize();return this}slerpQuaternions(t,n,i){return this.copy(t).slerp(n,i)}random(){let t=2*Math.PI*Math.random(),n=2*Math.PI*Math.random(),i=Math.random(),s=Math.sqrt(1-i),a=Math.sqrt(i);return this.set(s*Math.sin(t),s*Math.cos(t),a*Math.sin(n),a*Math.cos(n))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,n=0){return this._x=t[n],this._y=t[n+1],this._z=t[n+2],this._w=t[n+3],this._onChangeCallback(),this}toArray(t=[],n=0){return t[n]=this._x,t[n+1]=this._y,t[n+2]=this._z,t[n+3]=this._w,t}fromBufferAttribute(t,n){return this._x=t.getX(n),this._y=t.getY(n),this._z=t.getZ(n),this._w=t.getW(n),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},g_=class g_{constructor(t=0,n=0,i=0){this.x=t,this.y=n,this.z=i}set(t,n,i){return i===void 0&&(i=this.z),this.x=t,this.y=n,this.z=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;case 2:this.z=n;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this.z=t.z+n.z,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this.z+=t.z*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this.z=t.z-n.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,n){return this.x=t.x*n.x,this.y=t.y*n.y,this.z=t.z*n.z,this}applyEuler(t){return this.applyQuaternion(_b.setFromEuler(t))}applyAxisAngle(t,n){return this.applyQuaternion(_b.setFromAxisAngle(t,n))}applyMatrix3(t){let n=this.x,i=this.y,s=this.z,a=t.elements;return this.x=a[0]*n+a[3]*i+a[6]*s,this.y=a[1]*n+a[4]*i+a[7]*s,this.z=a[2]*n+a[5]*i+a[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let n=this.x,i=this.y,s=this.z,a=t.elements,r=1/(a[3]*n+a[7]*i+a[11]*s+a[15]);return this.x=(a[0]*n+a[4]*i+a[8]*s+a[12])*r,this.y=(a[1]*n+a[5]*i+a[9]*s+a[13])*r,this.z=(a[2]*n+a[6]*i+a[10]*s+a[14])*r,this}applyQuaternion(t){let n=this.x,i=this.y,s=this.z,a=t.x,r=t.y,o=t.z,l=t.w,c=2*(r*s-o*i),f=2*(o*n-a*s),p=2*(a*i-r*n);return this.x=n+l*c+r*p-o*f,this.y=i+l*f+o*c-a*p,this.z=s+l*p+a*f-r*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let n=this.x,i=this.y,s=this.z,a=t.elements;return this.x=a[0]*n+a[4]*i+a[8]*s,this.y=a[1]*n+a[5]*i+a[9]*s,this.z=a[2]*n+a[6]*i+a[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,n){return this.x=ee(this.x,t.x,n.x),this.y=ee(this.y,t.y,n.y),this.z=ee(this.z,t.z,n.z),this}clampScalar(t,n){return this.x=ee(this.x,t,n),this.y=ee(this.y,t,n),this.z=ee(this.z,t,n),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(ee(i,t,n))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this.z+=(t.z-this.z)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this.z=t.z+(n.z-t.z)*i,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,n){let i=t.x,s=t.y,a=t.z,r=n.x,o=n.y,l=n.z;return this.x=s*l-a*o,this.y=a*r-i*l,this.z=i*o-s*r,this}projectOnVector(t){let n=t.lengthSq();if(n===0)return this.set(0,0,0);let i=t.dot(this)/n;return this.copy(t).multiplyScalar(i)}projectOnPlane(t){return u0.copy(this).projectOnVector(t),this.sub(u0)}reflect(t){return this.sub(u0.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let n=Math.sqrt(this.lengthSq()*t.lengthSq());if(n===0)return Math.PI/2;let i=this.dot(t)/n;return Math.acos(ee(i,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let n=this.x-t.x,i=this.y-t.y,s=this.z-t.z;return n*n+i*i+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,n,i){let s=Math.sin(n)*t;return this.x=s*Math.sin(i),this.y=Math.cos(n)*t,this.z=s*Math.cos(i),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,n,i){return this.x=t*Math.sin(n),this.y=i,this.z=t*Math.cos(n),this}setFromMatrixPosition(t){let n=t.elements;return this.x=n[12],this.y=n[13],this.z=n[14],this}setFromMatrixScale(t){let n=this.setFromMatrixColumn(t,0).length(),i=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=n,this.y=i,this.z=s,this}setFromMatrixColumn(t,n){return this.fromArray(t.elements,n*4)}setFromMatrix3Column(t,n){return this.fromArray(t.elements,n*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this.z=t[n+2],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t[n+2]=this.z,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this.z=t.getZ(n),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,n=Math.random()*2-1,i=Math.sqrt(1-n*n);return this.x=i*Math.cos(t),this.y=n,this.z=i*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};g_.prototype.isVector3=!0;var B=g_,u0=new B,_b=new hs,__=class __{constructor(t,n,i,s,a,r,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,n,i,s,a,r,o,l,c)}set(t,n,i,s,a,r,o,l,c){let f=this.elements;return f[0]=t,f[1]=s,f[2]=o,f[3]=n,f[4]=a,f[5]=l,f[6]=i,f[7]=r,f[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let n=this.elements,i=t.elements;return n[0]=i[0],n[1]=i[1],n[2]=i[2],n[3]=i[3],n[4]=i[4],n[5]=i[5],n[6]=i[6],n[7]=i[7],n[8]=i[8],this}extractBasis(t,n,i){return t.setFromMatrix3Column(this,0),n.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let n=t.elements;return this.set(n[0],n[4],n[8],n[1],n[5],n[9],n[2],n[6],n[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,n){let i=t.elements,s=n.elements,a=this.elements,r=i[0],o=i[3],l=i[6],c=i[1],f=i[4],p=i[7],u=i[2],d=i[5],v=i[8],M=s[0],_=s[3],h=s[6],m=s[1],S=s[4],y=s[7],E=s[2],A=s[5],C=s[8];return a[0]=r*M+o*m+l*E,a[3]=r*_+o*S+l*A,a[6]=r*h+o*y+l*C,a[1]=c*M+f*m+p*E,a[4]=c*_+f*S+p*A,a[7]=c*h+f*y+p*C,a[2]=u*M+d*m+v*E,a[5]=u*_+d*S+v*A,a[8]=u*h+d*y+v*C,this}multiplyScalar(t){let n=this.elements;return n[0]*=t,n[3]*=t,n[6]*=t,n[1]*=t,n[4]*=t,n[7]*=t,n[2]*=t,n[5]*=t,n[8]*=t,this}determinant(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],f=t[8];return n*r*f-n*o*c-i*a*f+i*o*l+s*a*c-s*r*l}invert(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],f=t[8],p=f*r-o*c,u=o*l-f*a,d=c*a-r*l,v=n*p+i*u+s*d;if(v===0)return this.set(0,0,0,0,0,0,0,0,0);let M=1/v;return t[0]=p*M,t[1]=(s*c-f*i)*M,t[2]=(o*i-s*r)*M,t[3]=u*M,t[4]=(f*n-s*l)*M,t[5]=(s*a-o*n)*M,t[6]=d*M,t[7]=(i*l-c*n)*M,t[8]=(r*n-i*a)*M,this}transpose(){let t,n=this.elements;return t=n[1],n[1]=n[3],n[3]=t,t=n[2],n[2]=n[6],n[6]=t,t=n[5],n[5]=n[7],n[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let n=this.elements;return t[0]=n[0],t[1]=n[3],t[2]=n[6],t[3]=n[1],t[4]=n[4],t[5]=n[7],t[6]=n[2],t[7]=n[5],t[8]=n[8],this}setUvTransform(t,n,i,s,a,r,o){let l=Math.cos(a),c=Math.sin(a);return this.set(i*l,i*c,-i*(l*r+c*o)+r+t,-s*c,s*l,-s*(-c*r+l*o)+o+n,0,0,1),this}scale(t,n){return mr("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(h0.makeScale(t,n)),this}rotate(t){return mr("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(h0.makeRotation(-t)),this}translate(t,n){return mr("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(h0.makeTranslation(t,n)),this}makeTranslation(t,n){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,n,0,0,1),this}makeRotation(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,-i,0,i,n,0,0,0,1),this}makeScale(t,n){return this.set(t,0,0,0,n,0,0,0,1),this}equals(t){let n=this.elements,i=t.elements;for(let s=0;s<9;s++)if(n[s]!==i[s])return!1;return!0}fromArray(t,n=0){for(let i=0;i<9;i++)this.elements[i]=t[i+n];return this}toArray(t=[],n=0){let i=this.elements;return t[n]=i[0],t[n+1]=i[1],t[n+2]=i[2],t[n+3]=i[3],t[n+4]=i[4],t[n+5]=i[5],t[n+6]=i[6],t[n+7]=i[7],t[n+8]=i[8],t}clone(){return new this.constructor().fromArray(this.elements)}};__.prototype.isMatrix3=!0;var Bt=__,h0=new Bt,vb=new Bt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),yb=new Bt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Qw(){let e={enabled:!0,workingColorSpace:yc,spaces:{},convert:function(s,a,r){return this.enabled===!1||a===r||!a||!r||(this.spaces[a].transfer===de&&(s.r=Fs(s.r),s.g=Fs(s.g),s.b=Fs(s.b)),this.spaces[a].primaries!==this.spaces[r].primaries&&(s.applyMatrix3(this.spaces[a].toXYZ),s.applyMatrix3(this.spaces[r].fromXYZ)),this.spaces[r].transfer===de&&(s.r=Go(s.r),s.g=Go(s.g),s.b=Go(s.b))),s},workingToColorSpace:function(s,a){return this.convert(s,this.workingColorSpace,a)},colorSpaceToWorking:function(s,a){return this.convert(s,a,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Vs?xc:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,a=this.workingColorSpace){return s.fromArray(this.spaces[a].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,a,r){return s.copy(this.spaces[a].toXYZ).multiply(this.spaces[r].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,a){return mr("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),e.workingToColorSpace(s,a)},toWorkingColorSpace:function(s,a){return mr("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),e.colorSpaceToWorking(s,a)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],i=[.3127,.329];return e.define({[yc]:{primaries:t,whitePoint:i,transfer:xc,toXYZ:vb,fromXYZ:yb,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:ci},outputColorSpaceConfig:{drawingBufferColorSpace:ci}},[ci]:{primaries:t,whitePoint:i,transfer:de,toXYZ:vb,fromXYZ:yb,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:ci}}}),e}var te=Qw();function Fs(e){return e<.04045?e*.0773993808:Math.pow(e*.9478672986+.0521327014,2.4)}function Go(e){return e<.0031308?e*12.92:1.055*Math.pow(e,.41666)-.055}var To,Lf=class{static getDataURL(t,n="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let i;if(t instanceof HTMLCanvasElement)i=t;else{To===void 0&&(To=Sc("canvas")),To.width=t.width,To.height=t.height;let s=To.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),i=To}return i.toDataURL(n)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let n=Sc("canvas");n.width=t.width,n.height=t.height;let i=n.getContext("2d");i.drawImage(t,0,0,t.width,t.height);let s=i.getImageData(0,0,t.width,t.height),a=s.data;for(let r=0;r<a.length;r++)a[r]=Fs(a[r]/255)*255;return i.putImageData(s,0,0),n}else if(t.data){let n=t.data.slice(0);for(let i=0;i<n.length;i++)n instanceof Uint8Array||n instanceof Uint8ClampedArray?n[i]=Math.floor(Fs(n[i]/255)*255):n[i]=Fs(n[i]);return{data:n,width:t.width,height:t.height}}else return Dt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},jw=0,qo=class{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:jw++}),this.uuid=Ca(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let n=this.data;return typeof HTMLVideoElement<"u"&&n instanceof HTMLVideoElement?t.set(n.videoWidth,n.videoHeight,0):typeof VideoFrame<"u"&&n instanceof VideoFrame?t.set(n.displayWidth,n.displayHeight,0):n!==null?t.set(n.width,n.height,n.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let n=t===void 0||typeof t=="string";if(!n&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let i={uuid:this.uuid,url:""},s=this.data;if(s!==null){let a;if(Array.isArray(s)){a=[];for(let r=0,o=s.length;r<o;r++)s[r].isDataTexture?a.push(f0(s[r].image)):a.push(f0(s[r]))}else a=f0(s);i.url=a}return n||(t.images[this.uuid]=i),i}};function f0(e){return typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap?Lf.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(Dt("Texture: Unable to serialize Texture."),{})}var $w=0,d0=new B,zn=class e extends us{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,i=ls,s=ls,a=Mn,r=Pa,o=Ti,l=Jn,c=e.DEFAULT_ANISOTROPY,f=Vs){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:$w++}),this.uuid=Ca(),this.name="",this.source=new qo(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=i,this.wrapT=s,this.magFilter=a,this.minFilter=r,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new It(0,0),this.repeat=new It(1,1),this.center=new It(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Bt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=f,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(d0).x}get height(){return this.source.getSize(d0).y}get depth(){return this.source.getSize(d0).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,n){this.updateRanges.push({start:t,count:n})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let n in t){let i=t[n];if(i===void 0){Dt(`Texture.setValues(): parameter '${n}' has value of undefined.`);continue}let s=this[n];if(s===void 0){Dt(`Texture.setValues(): property '${n}' does not exist.`);continue}s&&i&&s.isVector2&&i.isVector2||s&&i&&s.isVector3&&i.isVector3||s&&i&&s.isMatrix3&&i.isMatrix3?s.copy(i):this[n]=i}}toJSON(t){let n=t===void 0||typeof t=="string";if(!n&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),n||(t.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==e_)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case Rf:t.x=t.x-Math.floor(t.x);break;case ls:t.x=t.x<0?0:1;break;case Nf:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case Rf:t.y=t.y-Math.floor(t.y);break;case ls:t.y=t.y<0?0:1;break;case Nf:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};zn.DEFAULT_IMAGE=null;zn.DEFAULT_MAPPING=e_;zn.DEFAULT_ANISOTROPY=1;var v_=class v_{constructor(t=0,n=0,i=0,s=1){this.x=t,this.y=n,this.z=i,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,n,i,s){return this.x=t,this.y=n,this.z=i,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;case 2:this.z=n;break;case 3:this.w=n;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this.z=t.z+n.z,this.w=t.w+n.w,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this.z+=t.z*n,this.w+=t.w*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this.z=t.z-n.z,this.w=t.w-n.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let n=this.x,i=this.y,s=this.z,a=this.w,r=t.elements;return this.x=r[0]*n+r[4]*i+r[8]*s+r[12]*a,this.y=r[1]*n+r[5]*i+r[9]*s+r[13]*a,this.z=r[2]*n+r[6]*i+r[10]*s+r[14]*a,this.w=r[3]*n+r[7]*i+r[11]*s+r[15]*a,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let n=Math.sqrt(1-t.w*t.w);return n<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/n,this.y=t.y/n,this.z=t.z/n),this}setAxisAngleFromRotationMatrix(t){let n,i,s,a,l=t.elements,c=l[0],f=l[4],p=l[8],u=l[1],d=l[5],v=l[9],M=l[2],_=l[6],h=l[10];if(Math.abs(f-u)<.01&&Math.abs(p-M)<.01&&Math.abs(v-_)<.01){if(Math.abs(f+u)<.1&&Math.abs(p+M)<.1&&Math.abs(v+_)<.1&&Math.abs(c+d+h-3)<.1)return this.set(1,0,0,0),this;n=Math.PI;let S=(c+1)/2,y=(d+1)/2,E=(h+1)/2,A=(f+u)/4,C=(p+M)/4,g=(v+_)/4;return S>y&&S>E?S<.01?(i=0,s=.707106781,a=.707106781):(i=Math.sqrt(S),s=A/i,a=C/i):y>E?y<.01?(i=.707106781,s=0,a=.707106781):(s=Math.sqrt(y),i=A/s,a=g/s):E<.01?(i=.707106781,s=.707106781,a=0):(a=Math.sqrt(E),i=C/a,s=g/a),this.set(i,s,a,n),this}let m=Math.sqrt((_-v)*(_-v)+(p-M)*(p-M)+(u-f)*(u-f));return Math.abs(m)<.001&&(m=1),this.x=(_-v)/m,this.y=(p-M)/m,this.z=(u-f)/m,this.w=Math.acos((c+d+h-1)/2),this}setFromMatrixPosition(t){let n=t.elements;return this.x=n[12],this.y=n[13],this.z=n[14],this.w=n[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,n){return this.x=ee(this.x,t.x,n.x),this.y=ee(this.y,t.y,n.y),this.z=ee(this.z,t.z,n.z),this.w=ee(this.w,t.w,n.w),this}clampScalar(t,n){return this.x=ee(this.x,t,n),this.y=ee(this.y,t,n),this.z=ee(this.z,t,n),this.w=ee(this.w,t,n),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(ee(i,t,n))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this.z+=(t.z-this.z)*n,this.w+=(t.w-this.w)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this.z=t.z+(n.z-t.z)*i,this.w=t.w+(n.w-t.w)*i,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this.z=t[n+2],this.w=t[n+3],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t[n+2]=this.z,t[n+3]=this.w,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this.z=t.getZ(n),this.w=t.getW(n),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};v_.prototype.isVector4=!0;var ze=v_,Of=class extends us{constructor(t=1,n=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Mn,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},i),this.isRenderTarget=!0,this.width=t,this.height=n,this.depth=i.depth,this.scissor=new ze(0,0,t,n),this.scissorTest=!1,this.viewport=new ze(0,0,t,n),this.textures=[];let s={width:t,height:n,depth:i.depth},a=new zn(s),r=i.count;for(let o=0;o<r;o++)this.textures[o]=a.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveColorBuffer=i.resolveColorBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.storeMultisampledColorBuffer=i.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=i.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=i.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview,this.useArrayDepthTexture=i.useArrayDepthTexture}_setTextureOptions(t={}){let n={minFilter:Mn,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(n.mapping=t.mapping),t.wrapS!==void 0&&(n.wrapS=t.wrapS),t.wrapT!==void 0&&(n.wrapT=t.wrapT),t.wrapR!==void 0&&(n.wrapR=t.wrapR),t.magFilter!==void 0&&(n.magFilter=t.magFilter),t.minFilter!==void 0&&(n.minFilter=t.minFilter),t.format!==void 0&&(n.format=t.format),t.type!==void 0&&(n.type=t.type),t.anisotropy!==void 0&&(n.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(n.colorSpace=t.colorSpace),t.flipY!==void 0&&(n.flipY=t.flipY),t.generateMipmaps!==void 0&&(n.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(n.internalFormat=t.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(n)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),t!==null&&t.renderTarget===null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,n,i=1){if(this.width!==t||this.height!==n||this.depth!==i){this.width=t,this.height=n,this.depth=i;for(let s=0,a=this.textures.length;s<a;s++)this.textures[s].image.width=t,this.textures[s].image.height=n,this.textures[s].image.depth=i,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,n),this.scissor.set(0,0,t,n)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let n=0,i=t.textures.length;n<i;n++){this.textures[n]=t.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0,this.textures[n].renderTarget=this;let s=Object.assign({},t.textures[n].image);this.textures[n].source=new qo(s)}if(this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveColorBuffer=t.resolveColorBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,this.storeMultisampledColorBuffer=t.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=t.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=t.storeMultisampledStencilBuffer,t.depthTexture!==null)if(t.depthTexture.renderTarget===t){let n=t.depthTexture.clone();n.renderTarget=null,this.depthTexture=n}else this.depthTexture=t.depthTexture;return this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},Yn=class extends Of{constructor(t=1,n=1,i={}){super(t,n,i),this.isWebGLRenderTarget=!0}},bc=class extends zn{constructor(t=null,n=1,i=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:n,height:i,depth:s},this.magFilter=hn,this.minFilter=hn,this.wrapR=ls,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var If=class extends zn{constructor(t=null,n=1,i=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:n,height:i,depth:s},this.magFilter=hn,this.minFilter=hn,this.wrapR=ls,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}};var ad=class ad{constructor(t,n,i,s,a,r,o,l,c,f,p,u,d,v,M,_){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,n,i,s,a,r,o,l,c,f,p,u,d,v,M,_)}set(t,n,i,s,a,r,o,l,c,f,p,u,d,v,M,_){let h=this.elements;return h[0]=t,h[4]=n,h[8]=i,h[12]=s,h[1]=a,h[5]=r,h[9]=o,h[13]=l,h[2]=c,h[6]=f,h[10]=p,h[14]=u,h[3]=d,h[7]=v,h[11]=M,h[15]=_,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new ad().fromArray(this.elements)}copy(t){let n=this.elements,i=t.elements;return n[0]=i[0],n[1]=i[1],n[2]=i[2],n[3]=i[3],n[4]=i[4],n[5]=i[5],n[6]=i[6],n[7]=i[7],n[8]=i[8],n[9]=i[9],n[10]=i[10],n[11]=i[11],n[12]=i[12],n[13]=i[13],n[14]=i[14],n[15]=i[15],this}copyPosition(t){let n=this.elements,i=t.elements;return n[12]=i[12],n[13]=i[13],n[14]=i[14],this}setFromMatrix3(t){let n=t.elements;return this.set(n[0],n[3],n[6],0,n[1],n[4],n[7],0,n[2],n[5],n[8],0,0,0,0,1),this}extractBasis(t,n,i){return this.determinantAffine()===0?(t.set(1,0,0),n.set(0,1,0),i.set(0,0,1),this):(t.setFromMatrixColumn(this,0),n.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this)}makeBasis(t,n,i){return this.set(t.x,n.x,i.x,0,t.y,n.y,i.y,0,t.z,n.z,i.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let n=this.elements,i=t.elements,s=1/Ao.setFromMatrixColumn(t,0).length(),a=1/Ao.setFromMatrixColumn(t,1).length(),r=1/Ao.setFromMatrixColumn(t,2).length();return n[0]=i[0]*s,n[1]=i[1]*s,n[2]=i[2]*s,n[3]=0,n[4]=i[4]*a,n[5]=i[5]*a,n[6]=i[6]*a,n[7]=0,n[8]=i[8]*r,n[9]=i[9]*r,n[10]=i[10]*r,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,this}makeRotationFromEuler(t){let n=this.elements,i=t.x,s=t.y,a=t.z,r=Math.cos(i),o=Math.sin(i),l=Math.cos(s),c=Math.sin(s),f=Math.cos(a),p=Math.sin(a);if(t.order==="XYZ"){let u=r*f,d=r*p,v=o*f,M=o*p;n[0]=l*f,n[4]=-l*p,n[8]=c,n[1]=d+v*c,n[5]=u-M*c,n[9]=-o*l,n[2]=M-u*c,n[6]=v+d*c,n[10]=r*l}else if(t.order==="YXZ"){let u=l*f,d=l*p,v=c*f,M=c*p;n[0]=u+M*o,n[4]=v*o-d,n[8]=r*c,n[1]=r*p,n[5]=r*f,n[9]=-o,n[2]=d*o-v,n[6]=M+u*o,n[10]=r*l}else if(t.order==="ZXY"){let u=l*f,d=l*p,v=c*f,M=c*p;n[0]=u-M*o,n[4]=-r*p,n[8]=v+d*o,n[1]=d+v*o,n[5]=r*f,n[9]=M-u*o,n[2]=-r*c,n[6]=o,n[10]=r*l}else if(t.order==="ZYX"){let u=r*f,d=r*p,v=o*f,M=o*p;n[0]=l*f,n[4]=v*c-d,n[8]=u*c+M,n[1]=l*p,n[5]=M*c+u,n[9]=d*c-v,n[2]=-c,n[6]=o*l,n[10]=r*l}else if(t.order==="YZX"){let u=r*l,d=r*c,v=o*l,M=o*c;n[0]=l*f,n[4]=M-u*p,n[8]=v*p+d,n[1]=p,n[5]=r*f,n[9]=-o*f,n[2]=-c*f,n[6]=d*p+v,n[10]=u-M*p}else if(t.order==="XZY"){let u=r*l,d=r*c,v=o*l,M=o*c;n[0]=l*f,n[4]=-p,n[8]=c*f,n[1]=u*p+M,n[5]=r*f,n[9]=d*p-v,n[2]=v*p-d,n[6]=o*f,n[10]=M*p+u}return n[3]=0,n[7]=0,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,this}makeRotationFromQuaternion(t){return this.compose(tC,t,eC)}lookAt(t,n,i){let s=this.elements;return oi.subVectors(t,n),oi.lengthSq()===0&&(oi.z=1),oi.normalize(),ba.crossVectors(i,oi),ba.lengthSq()===0&&(Math.abs(i.z)===1?oi.x+=1e-4:oi.z+=1e-4,oi.normalize(),ba.crossVectors(i,oi)),ba.normalize(),Jh.crossVectors(oi,ba),s[0]=ba.x,s[4]=Jh.x,s[8]=oi.x,s[1]=ba.y,s[5]=Jh.y,s[9]=oi.y,s[2]=ba.z,s[6]=Jh.z,s[10]=oi.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,n){let i=t.elements,s=n.elements,a=this.elements,r=i[0],o=i[4],l=i[8],c=i[12],f=i[1],p=i[5],u=i[9],d=i[13],v=i[2],M=i[6],_=i[10],h=i[14],m=i[3],S=i[7],y=i[11],E=i[15],A=s[0],C=s[4],g=s[8],b=s[12],R=s[1],U=s[5],I=s[9],F=s[13],D=s[2],G=s[6],Y=s[10],Z=s[14],it=s[3],W=s[7],$=s[11],et=s[15];return a[0]=r*A+o*R+l*D+c*it,a[4]=r*C+o*U+l*G+c*W,a[8]=r*g+o*I+l*Y+c*$,a[12]=r*b+o*F+l*Z+c*et,a[1]=f*A+p*R+u*D+d*it,a[5]=f*C+p*U+u*G+d*W,a[9]=f*g+p*I+u*Y+d*$,a[13]=f*b+p*F+u*Z+d*et,a[2]=v*A+M*R+_*D+h*it,a[6]=v*C+M*U+_*G+h*W,a[10]=v*g+M*I+_*Y+h*$,a[14]=v*b+M*F+_*Z+h*et,a[3]=m*A+S*R+y*D+E*it,a[7]=m*C+S*U+y*G+E*W,a[11]=m*g+S*I+y*Y+E*$,a[15]=m*b+S*F+y*Z+E*et,this}multiplyScalar(t){let n=this.elements;return n[0]*=t,n[4]*=t,n[8]*=t,n[12]*=t,n[1]*=t,n[5]*=t,n[9]*=t,n[13]*=t,n[2]*=t,n[6]*=t,n[10]*=t,n[14]*=t,n[3]*=t,n[7]*=t,n[11]*=t,n[15]*=t,this}determinant(){let t=this.elements,n=t[0],i=t[4],s=t[8],a=t[12],r=t[1],o=t[5],l=t[9],c=t[13],f=t[2],p=t[6],u=t[10],d=t[14],v=t[3],M=t[7],_=t[11],h=t[15],m=l*d-c*u,S=o*d-c*p,y=o*u-l*p,E=r*d-c*f,A=r*u-l*f,C=r*p-o*f;return n*(M*m-_*S+h*y)-i*(v*m-_*E+h*A)+s*(v*S-M*E+h*C)-a*(v*y-M*A+_*C)}determinantAffine(){let t=this.elements,n=t[0],i=t[4],s=t[8],a=t[1],r=t[5],o=t[9],l=t[2],c=t[6],f=t[10];return n*(r*f-o*c)-i*(a*f-o*l)+s*(a*c-r*l)}transpose(){let t=this.elements,n;return n=t[1],t[1]=t[4],t[4]=n,n=t[2],t[2]=t[8],t[8]=n,n=t[6],t[6]=t[9],t[9]=n,n=t[3],t[3]=t[12],t[12]=n,n=t[7],t[7]=t[13],t[13]=n,n=t[11],t[11]=t[14],t[14]=n,this}setPosition(t,n,i){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=n,s[14]=i),this}invert(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],f=t[8],p=t[9],u=t[10],d=t[11],v=t[12],M=t[13],_=t[14],h=t[15],m=n*o-i*r,S=n*l-s*r,y=n*c-a*r,E=i*l-s*o,A=i*c-a*o,C=s*c-a*l,g=f*M-p*v,b=f*_-u*v,R=f*h-d*v,U=p*_-u*M,I=p*h-d*M,F=u*h-d*_,D=m*F-S*I+y*U+E*R-A*b+C*g;if(D===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let G=1/D;return t[0]=(o*F-l*I+c*U)*G,t[1]=(s*I-i*F-a*U)*G,t[2]=(M*C-_*A+h*E)*G,t[3]=(u*A-p*C-d*E)*G,t[4]=(l*R-r*F-c*b)*G,t[5]=(n*F-s*R+a*b)*G,t[6]=(_*y-v*C-h*S)*G,t[7]=(f*C-u*y+d*S)*G,t[8]=(r*I-o*R+c*g)*G,t[9]=(i*R-n*I-a*g)*G,t[10]=(v*A-M*y+h*m)*G,t[11]=(p*y-f*A-d*m)*G,t[12]=(o*b-r*U-l*g)*G,t[13]=(n*U-i*b+s*g)*G,t[14]=(M*S-v*E-_*m)*G,t[15]=(f*E-p*S+u*m)*G,this}scale(t){let n=this.elements,i=t.x,s=t.y,a=t.z;return n[0]*=i,n[4]*=s,n[8]*=a,n[1]*=i,n[5]*=s,n[9]*=a,n[2]*=i,n[6]*=s,n[10]*=a,n[3]*=i,n[7]*=s,n[11]*=a,this}getMaxScaleOnAxis(){let t=this.elements,n=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],i=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(n,i,s))}makeTranslation(t,n,i){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,n,0,0,1,i,0,0,0,1),this}makeRotationX(t){let n=Math.cos(t),i=Math.sin(t);return this.set(1,0,0,0,0,n,-i,0,0,i,n,0,0,0,0,1),this}makeRotationY(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,0,i,0,0,1,0,0,-i,0,n,0,0,0,0,1),this}makeRotationZ(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,-i,0,0,i,n,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,n){let i=Math.cos(n),s=Math.sin(n),a=1-i,r=t.x,o=t.y,l=t.z,c=a*r,f=a*o;return this.set(c*r+i,c*o-s*l,c*l+s*o,0,c*o+s*l,f*o+i,f*l-s*r,0,c*l-s*o,f*l+s*r,a*l*l+i,0,0,0,0,1),this}makeScale(t,n,i){return this.set(t,0,0,0,0,n,0,0,0,0,i,0,0,0,0,1),this}makeShear(t,n,i,s,a,r){return this.set(1,i,a,0,t,1,r,0,n,s,1,0,0,0,0,1),this}compose(t,n,i){let s=this.elements,a=n._x,r=n._y,o=n._z,l=n._w,c=a+a,f=r+r,p=o+o,u=a*c,d=a*f,v=a*p,M=r*f,_=r*p,h=o*p,m=l*c,S=l*f,y=l*p,E=i.x,A=i.y,C=i.z;return s[0]=(1-(M+h))*E,s[1]=(d+y)*E,s[2]=(v-S)*E,s[3]=0,s[4]=(d-y)*A,s[5]=(1-(u+h))*A,s[6]=(_+m)*A,s[7]=0,s[8]=(v+S)*C,s[9]=(_-m)*C,s[10]=(1-(u+M))*C,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,n,i){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let a=this.determinantAffine();if(a===0)return i.set(1,1,1),n.identity(),this;let r=Ao.set(s[0],s[1],s[2]).length(),o=Ao.set(s[4],s[5],s[6]).length(),l=Ao.set(s[8],s[9],s[10]).length();a<0&&(r=-r),Li.copy(this);let c=1/r,f=1/o,p=1/l;return Li.elements[0]*=c,Li.elements[1]*=c,Li.elements[2]*=c,Li.elements[4]*=f,Li.elements[5]*=f,Li.elements[6]*=f,Li.elements[8]*=p,Li.elements[9]*=p,Li.elements[10]*=p,n.setFromRotationMatrix(Li),i.x=r,i.y=o,i.z=l,this}makePerspective(t,n,i,s,a,r,o=Bi,l=!1){let c=this.elements,f=2*a/(n-t),p=2*a/(i-s),u=(n+t)/(n-t),d=(i+s)/(i-s),v,M;if(l)v=a/(r-a),M=r*a/(r-a);else if(o===Bi)v=-(r+a)/(r-a),M=-2*r*a/(r-a);else if(o===Xo)v=-r/(r-a),M=-r*a/(r-a);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=f,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=p,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=v,c[14]=M,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,n,i,s,a,r,o=Bi,l=!1){let c=this.elements,f=2/(n-t),p=2/(i-s),u=-(n+t)/(n-t),d=-(i+s)/(i-s),v,M;if(l)v=1/(r-a),M=r/(r-a);else if(o===Bi)v=-2/(r-a),M=-(r+a)/(r-a);else if(o===Xo)v=-1/(r-a),M=-a/(r-a);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=f,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=p,c[9]=0,c[13]=d,c[2]=0,c[6]=0,c[10]=v,c[14]=M,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let n=this.elements,i=t.elements;for(let s=0;s<16;s++)if(n[s]!==i[s])return!1;return!0}fromArray(t,n=0){for(let i=0;i<16;i++)this.elements[i]=t[i+n];return this}toArray(t=[],n=0){let i=this.elements;return t[n]=i[0],t[n+1]=i[1],t[n+2]=i[2],t[n+3]=i[3],t[n+4]=i[4],t[n+5]=i[5],t[n+6]=i[6],t[n+7]=i[7],t[n+8]=i[8],t[n+9]=i[9],t[n+10]=i[10],t[n+11]=i[11],t[n+12]=i[12],t[n+13]=i[13],t[n+14]=i[14],t[n+15]=i[15],t}};ad.prototype.isMatrix4=!0;var Oe=ad,Ao=new B,Li=new Oe,tC=new B(0,0,0),eC=new B(1,1,1),ba=new B,Jh=new B,oi=new B,xb=new Oe,Sb=new hs,Hs=class e{constructor(t=0,n=0,i=0,s=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=i,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,n,i,s=this._order){return this._x=t,this._y=n,this._z=i,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,n=this._order,i=!0){let s=t.elements,a=s[0],r=s[4],o=s[8],l=s[1],c=s[5],f=s[9],p=s[2],u=s[6],d=s[10];switch(n){case"XYZ":this._y=Math.asin(ee(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-f,d),this._z=Math.atan2(-r,a)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ee(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(o,d),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-p,a),this._z=0);break;case"ZXY":this._x=Math.asin(ee(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-p,d),this._z=Math.atan2(-r,c)):(this._y=0,this._z=Math.atan2(l,a));break;case"ZYX":this._y=Math.asin(-ee(p,-1,1)),Math.abs(p)<.9999999?(this._x=Math.atan2(u,d),this._z=Math.atan2(l,a)):(this._x=0,this._z=Math.atan2(-r,c));break;case"YZX":this._z=Math.asin(ee(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-f,c),this._y=Math.atan2(-p,a)):(this._x=0,this._y=Math.atan2(o,d));break;case"XZY":this._z=Math.asin(-ee(r,-1,1)),Math.abs(r)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,a)):(this._x=Math.atan2(-f,d),this._y=0);break;default:Dt("Euler: .setFromRotationMatrix() encountered an unknown order: "+n)}return this._order=n,i===!0&&this._onChangeCallback(),this}setFromQuaternion(t,n,i){return xb.makeRotationFromQuaternion(t),this.setFromRotationMatrix(xb,n,i)}setFromVector3(t,n=this._order){return this.set(t.x,t.y,t.z,n)}reorder(t){return Sb.setFromEuler(this),this.setFromQuaternion(Sb,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],n=0){return t[n]=this._x,t[n+1]=this._y,t[n+2]=this._z,t[n+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Hs.DEFAULT_ORDER="XYZ";var Ec=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},nC=0,Mb=new B,wo=new hs,Ls=new Oe,Kh=new B,uc=new B,iC=new B,sC=new hs,bb=new B(1,0,0),Eb=new B(0,1,0),Tb=new B(0,0,1),Ab={type:"added"},aC={type:"removed"},Co={type:"childadded",child:null},p0={type:"childremoved",child:null},fn=class e extends us{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:nC++}),this.uuid=Ca(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new B,n=new Hs,i=new hs,s=new B(1,1,1);function a(){i.setFromEuler(n,!1)}function r(){n.setFromQuaternion(i,void 0,!1)}n._onChange(a),i._onChange(r),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new Oe},normalMatrix:{value:new Bt}}),this.matrix=new Oe,this.matrixWorld=new Oe,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ec,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,n){this.quaternion.setFromAxisAngle(t,n)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,n){return wo.setFromAxisAngle(t,n),this.quaternion.multiply(wo),this}rotateOnWorldAxis(t,n){return wo.setFromAxisAngle(t,n),this.quaternion.premultiply(wo),this}rotateX(t){return this.rotateOnAxis(bb,t)}rotateY(t){return this.rotateOnAxis(Eb,t)}rotateZ(t){return this.rotateOnAxis(Tb,t)}translateOnAxis(t,n){return Mb.copy(t).applyQuaternion(this.quaternion),this.position.add(Mb.multiplyScalar(n)),this}translateX(t){return this.translateOnAxis(bb,t)}translateY(t){return this.translateOnAxis(Eb,t)}translateZ(t){return this.translateOnAxis(Tb,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(Ls.copy(this.matrixWorld).invert())}lookAt(t,n,i){t.isVector3?Kh.copy(t):Kh.set(t,n,i);let s=this.parent;this.updateWorldMatrix(!0,!1),uc.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Ls.lookAt(uc,Kh,this.up):Ls.lookAt(Kh,uc,this.up),this.quaternion.setFromRotationMatrix(Ls),s&&(Ls.extractRotation(s.matrixWorld),wo.setFromRotationMatrix(Ls),this.quaternion.premultiply(wo.invert()))}add(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.add(arguments[n]);return this}return t===this?(Ut("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Ab),Co.child=t,this.dispatchEvent(Co),Co.child=null):Ut("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}let n=this.children.indexOf(t);return n!==-1&&(t.parent=null,this.children.splice(n,1),t.dispatchEvent(aC),p0.child=t,this.dispatchEvent(p0),p0.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),Ls.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),Ls.multiply(t.parent.matrixWorld)),t.applyMatrix4(Ls),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Ab),Co.child=t,this.dispatchEvent(Co),Co.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,n){if(this[t]===n)return this;for(let i=0,s=this.children.length;i<s;i++){let r=this.children[i].getObjectByProperty(t,n);if(r!==void 0)return r}}getObjectsByProperty(t,n,i=[]){this[t]===n&&i.push(this);let s=this.children;for(let a=0,r=s.length;a<r;a++)s[a].getObjectsByProperty(t,n,i);return i}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(uc,t,iC),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(uc,sC,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let n=this.matrixWorld.elements;return t.set(n[8],n[9],n[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(t){t(this);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].traverseVisible(t)}traverseAncestors(t){let n=this.parent;n!==null&&(t(n),n.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let n=t.x,i=t.y,s=t.z,a=this.matrix.elements;a[12]+=n-a[0]*n-a[4]*i-a[8]*s,a[13]+=i-a[1]*n-a[5]*i-a[9]*s,a[14]+=s-a[2]*n-a[6]*i-a[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].updateMatrixWorld(t)}updateWorldMatrix(t,n,i=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||i)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,i=!0),n===!0){let a=this.children;for(let r=0,o=a.length;r<o;r++)a[r].updateWorldMatrix(!1,!0,i)}}toJSON(t){let n=t===void 0||typeof t=="string",i={};n&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,s.name=this.name,s.castShadow=this.castShadow,s.receiveShadow=this.receiveShadow,s.visible=this.visible,s.frustumCulled=this.frustumCulled,s.renderOrder=this.renderOrder,s.static=this.static,s.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function a(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=a(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,f=l.length;c<f;c++){let p=l[c];a(t.shapes,p)}else a(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(a(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(a(t.materials,this.material[l]));s.material=o}else s.material=a(t.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];s.animations.push(a(t.animations,l))}}if(n){let o=r(t.geometries),l=r(t.materials),c=r(t.textures),f=r(t.images),p=r(t.shapes),u=r(t.skeletons),d=r(t.animations),v=r(t.nodes);o.length>0&&(i.geometries=o),l.length>0&&(i.materials=l),c.length>0&&(i.textures=c),f.length>0&&(i.images=f),p.length>0&&(i.shapes=p),u.length>0&&(i.skeletons=u),d.length>0&&(i.animations=d),v.length>0&&(i.nodes=v)}return i.object=s,i;function r(o){let l=[];for(let c in o){let f=o[c];delete f.metadata,l.push(f)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,n=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),n===!0)for(let i=0;i<t.children.length;i++){let s=t.children[i];this.add(s.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};fn.DEFAULT_UP=new B(0,1,0);fn.DEFAULT_MATRIX_AUTO_UPDATE=!0;fn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Sn=class extends fn{constructor(){super(),this.isGroup=!0,this.type="Group"}},rC={type:"move"},Yo=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Sn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Sn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new B,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new B),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Sn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new B,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new B,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let n=this._hand;if(n)for(let i of t.hand.values())this._getHandJoint(n,i)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,n,i){let s=null,a=null,r=null,o=this._targetRay,l=this._grip,c=this._hand;if(t&&n.session.visibilityState!=="visible-blurred"){if(c&&t.hand){r=!0;for(let M of t.hand.values()){let _=n.getJointPose(M,i),h=this._getHandJoint(c,M);_!==null&&(h.matrix.fromArray(_.transform.matrix),h.matrix.decompose(h.position,h.rotation,h.scale),h.matrixWorldNeedsUpdate=!0,h.jointRadius=_.radius),h.visible=_!==null}let f=c.joints["index-finger-tip"],p=c.joints["thumb-tip"],u=f.position.distanceTo(p.position),d=.02,v=.005;c.inputState.pinching&&u>d+v?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=d-v&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(a=n.getPose(t.gripSpace,i),a!==null&&(l.matrix.fromArray(a.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,a.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(a.linearVelocity)):l.hasLinearVelocity=!1,a.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(a.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));o!==null&&(s=n.getPose(t.targetRaySpace,i),s===null&&a!==null&&(s=a),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(rC)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=a!==null),c!==null&&(c.visible=r!==null),this}_getHandJoint(t,n){if(t.joints[n.jointName]===void 0){let i=new Sn;i.matrixAutoUpdate=!1,i.visible=!1,t.joints[n.jointName]=i,t.add(i)}return t.joints[n.jointName]}},A1={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ea={h:0,s:0,l:0},Qh={h:0,s:0,l:0};function m0(e,t,n){return n<0&&(n+=1),n>1&&(n-=1),n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var Ht=class{constructor(t,n,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,n,i)}set(t,n,i){if(n===void 0&&i===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,n,i);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,n=ci){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,te.colorSpaceToWorking(this,n),this}setRGB(t,n,i,s=te.workingColorSpace){return this.r=t,this.g=n,this.b=i,te.colorSpaceToWorking(this,s),this}setHSL(t,n,i,s=te.workingColorSpace){if(t=Kw(t,1),n=ee(n,0,1),i=ee(i,0,1),n===0)this.r=this.g=this.b=i;else{let a=i<=.5?i*(1+n):i+n-i*n,r=2*i-a;this.r=m0(r,a,t+1/3),this.g=m0(r,a,t),this.b=m0(r,a,t-1/3)}return te.colorSpaceToWorking(this,s),this}setStyle(t,n=ci){function i(a){a!==void 0&&parseFloat(a)<1&&Dt("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let a,r=s[1],o=s[2];switch(r){case"rgb":case"rgba":if(a=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setRGB(Math.min(255,parseInt(a[1],10))/255,Math.min(255,parseInt(a[2],10))/255,Math.min(255,parseInt(a[3],10))/255,n);if(a=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setRGB(Math.min(100,parseInt(a[1],10))/100,Math.min(100,parseInt(a[2],10))/100,Math.min(100,parseInt(a[3],10))/100,n);break;case"hsl":case"hsla":if(a=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setHSL(parseFloat(a[1])/360,parseFloat(a[2])/100,parseFloat(a[3])/100,n);break;default:Dt("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let a=s[1],r=a.length;if(r===3)return this.setRGB(parseInt(a.charAt(0),16)/15,parseInt(a.charAt(1),16)/15,parseInt(a.charAt(2),16)/15,n);if(r===6)return this.setHex(parseInt(a,16),n);Dt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,n);return this}setColorName(t,n=ci){let i=A1[t.toLowerCase()];return i!==void 0?this.setHex(i,n):Dt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=Fs(t.r),this.g=Fs(t.g),this.b=Fs(t.b),this}copyLinearToSRGB(t){return this.r=Go(t.r),this.g=Go(t.g),this.b=Go(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=ci){return te.workingToColorSpace(Rn.copy(this),t),Math.round(ee(Rn.r*255,0,255))*65536+Math.round(ee(Rn.g*255,0,255))*256+Math.round(ee(Rn.b*255,0,255))}getHexString(t=ci){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,n=te.workingColorSpace){te.workingToColorSpace(Rn.copy(this),n);let i=Rn.r,s=Rn.g,a=Rn.b,r=Math.max(i,s,a),o=Math.min(i,s,a),l,c,f=(o+r)/2;if(o===r)l=0,c=0;else{let p=r-o;switch(c=f<=.5?p/(r+o):p/(2-r-o),r){case i:l=(s-a)/p+(s<a?6:0);break;case s:l=(a-i)/p+2;break;case a:l=(i-s)/p+4;break}l/=6}return t.h=l,t.s=c,t.l=f,t}getRGB(t,n=te.workingColorSpace){return te.workingToColorSpace(Rn.copy(this),n),t.r=Rn.r,t.g=Rn.g,t.b=Rn.b,t}getStyle(t=ci){te.workingToColorSpace(Rn.copy(this),t);let n=Rn.r,i=Rn.g,s=Rn.b;return t!==ci?`color(${t} ${n.toFixed(3)} ${i.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(n*255)},${Math.round(i*255)},${Math.round(s*255)})`}offsetHSL(t,n,i){return this.getHSL(Ea),this.setHSL(Ea.h+t,Ea.s+n,Ea.l+i)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,n){return this.r=t.r+n.r,this.g=t.g+n.g,this.b=t.b+n.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,n){return this.r+=(t.r-this.r)*n,this.g+=(t.g-this.g)*n,this.b+=(t.b-this.b)*n,this}lerpColors(t,n,i){return this.r=t.r+(n.r-t.r)*i,this.g=t.g+(n.g-t.g)*i,this.b=t.b+(n.b-t.b)*i,this}lerpHSL(t,n){this.getHSL(Ea),t.getHSL(Qh);let i=c0(Ea.h,Qh.h,n),s=c0(Ea.s,Qh.s,n),a=c0(Ea.l,Qh.l,n);return this.setHSL(i,s,a),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let n=this.r,i=this.g,s=this.b,a=t.elements;return this.r=a[0]*n+a[3]*i+a[6]*s,this.g=a[1]*n+a[4]*i+a[7]*s,this.b=a[2]*n+a[5]*i+a[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,n=0){return this.r=t[n],this.g=t[n+1],this.b=t[n+2],this}toArray(t=[],n=0){return t[n]=this.r,t[n+1]=this.g,t[n+2]=this.b,t}fromBufferAttribute(t,n){return this.r=t.getX(n),this.g=t.getY(n),this.b=t.getZ(n),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Rn=new Ht;Ht.NAMES=A1;var Tc=class e{constructor(t,n=25e-5){this.isFogExp2=!0,this.name="",this.color=new Ht(t),this.density=n}clone(){return new e(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}};var Ac=class extends fn{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Hs,this.environmentIntensity=1,this.environmentRotation=new Hs,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,n){return super.copy(t,n),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let n=super.toJSON(t);return this.fog!==null&&(n.object.fog=this.fog.toJSON()),n.object.backgroundBlurriness=this.backgroundBlurriness,n.object.backgroundIntensity=this.backgroundIntensity,n.object.backgroundRotation=this.backgroundRotation.toArray(),n.object.environmentIntensity=this.environmentIntensity,n.object.environmentRotation=this.environmentRotation.toArray(),n}},Oi=new B,Os=new B,g0=new B,Is=new B,Ro=new B,No=new B,wb=new B,_0=new B,v0=new B,y0=new B,x0=new ze,S0=new ze,M0=new ze,zs=class e{constructor(t=new B,n=new B,i=new B){this.a=t,this.b=n,this.c=i}static getNormal(t,n,i,s){s.subVectors(i,n),Oi.subVectors(t,n),s.cross(Oi);let a=s.lengthSq();return a>0?s.multiplyScalar(1/Math.sqrt(a)):s.set(0,0,0)}static getBarycoord(t,n,i,s,a){Oi.subVectors(s,n),Os.subVectors(i,n),g0.subVectors(t,n);let r=Oi.dot(Oi),o=Oi.dot(Os),l=Oi.dot(g0),c=Os.dot(Os),f=Os.dot(g0),p=r*c-o*o;if(p===0)return a.set(0,0,0),null;let u=1/p,d=(c*l-o*f)*u,v=(r*f-o*l)*u;return a.set(1-d-v,v,d)}static containsPoint(t,n,i,s){return this.getBarycoord(t,n,i,s,Is)===null?!1:Is.x>=0&&Is.y>=0&&Is.x+Is.y<=1}static getInterpolation(t,n,i,s,a,r,o,l){return this.getBarycoord(t,n,i,s,Is)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(a,Is.x),l.addScaledVector(r,Is.y),l.addScaledVector(o,Is.z),l)}static getInterpolatedAttribute(t,n,i,s,a,r){return x0.setScalar(0),S0.setScalar(0),M0.setScalar(0),x0.fromBufferAttribute(t,n),S0.fromBufferAttribute(t,i),M0.fromBufferAttribute(t,s),r.setScalar(0),r.addScaledVector(x0,a.x),r.addScaledVector(S0,a.y),r.addScaledVector(M0,a.z),r}static isFrontFacing(t,n,i,s){return Oi.subVectors(i,n),Os.subVectors(t,n),Oi.cross(Os).dot(s)<0}set(t,n,i){return this.a.copy(t),this.b.copy(n),this.c.copy(i),this}setFromPointsAndIndices(t,n,i,s){return this.a.copy(t[n]),this.b.copy(t[i]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,n,i,s){return this.a.fromBufferAttribute(t,n),this.b.fromBufferAttribute(t,i),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Oi.subVectors(this.c,this.b),Os.subVectors(this.a,this.b),Oi.cross(Os).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,i,s,a){return e.getInterpolation(t,this.a,this.b,this.c,n,i,s,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,n){let i=this.a,s=this.b,a=this.c,r,o;Ro.subVectors(s,i),No.subVectors(a,i),_0.subVectors(t,i);let l=Ro.dot(_0),c=No.dot(_0);if(l<=0&&c<=0)return n.copy(i);v0.subVectors(t,s);let f=Ro.dot(v0),p=No.dot(v0);if(f>=0&&p<=f)return n.copy(s);let u=l*p-f*c;if(u<=0&&l>=0&&f<=0)return r=l/(l-f),n.copy(i).addScaledVector(Ro,r);y0.subVectors(t,a);let d=Ro.dot(y0),v=No.dot(y0);if(v>=0&&d<=v)return n.copy(a);let M=d*c-l*v;if(M<=0&&c>=0&&v<=0)return o=c/(c-v),n.copy(i).addScaledVector(No,o);let _=f*v-d*p;if(_<=0&&p-f>=0&&d-v>=0)return wb.subVectors(a,s),o=(p-f)/(p-f+(d-v)),n.copy(s).addScaledVector(wb,o);let h=1/(_+M+u);return r=M*h,o=u*h,n.copy(i).addScaledVector(Ro,r).addScaledVector(No,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Ra=class{constructor(t=new B(1/0,1/0,1/0),n=new B(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=n}set(t,n){return this.min.copy(t),this.max.copy(n),this}setFromArray(t){this.makeEmpty();for(let n=0,i=t.length;n<i;n+=3)this.expandByPoint(Ii.fromArray(t,n));return this}setFromBufferAttribute(t){this.makeEmpty();for(let n=0,i=t.count;n<i;n++)this.expandByPoint(Ii.fromBufferAttribute(t,n));return this}setFromPoints(t){this.makeEmpty();for(let n=0,i=t.length;n<i;n++)this.expandByPoint(t[n]);return this}setFromCenterAndSize(t,n){let i=Ii.copy(n).multiplyScalar(.5);return this.min.copy(t).sub(i),this.max.copy(t).add(i),this}setFromObject(t,n=!1){return this.makeEmpty(),this.expandByObject(t,n)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,n=!1){t.updateWorldMatrix(!1,!1);let i=t.geometry;if(i!==void 0){let a=i.getAttribute("position");if(n===!0&&a!==void 0&&t.isInstancedMesh!==!0)for(let r=0,o=a.count;r<o;r++)t.isMesh===!0?t.getVertexPosition(r,Ii):Ii.fromBufferAttribute(a,r),Ii.applyMatrix4(t.matrixWorld),this.expandByPoint(Ii);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),jh.copy(t.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),jh.copy(i.boundingBox)),jh.applyMatrix4(t.matrixWorld),this.union(jh)}let s=t.children;for(let a=0,r=s.length;a<r;a++)this.expandByObject(s[a],n);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,n){return n.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Ii),Ii.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let n,i;return t.normal.x>0?(n=t.normal.x*this.min.x,i=t.normal.x*this.max.x):(n=t.normal.x*this.max.x,i=t.normal.x*this.min.x),t.normal.y>0?(n+=t.normal.y*this.min.y,i+=t.normal.y*this.max.y):(n+=t.normal.y*this.max.y,i+=t.normal.y*this.min.y),t.normal.z>0?(n+=t.normal.z*this.min.z,i+=t.normal.z*this.max.z):(n+=t.normal.z*this.max.z,i+=t.normal.z*this.min.z),n<=-t.constant&&i>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(hc),$h.subVectors(this.max,hc),Do.subVectors(t.a,hc),Uo.subVectors(t.b,hc),Lo.subVectors(t.c,hc),Ta.subVectors(Uo,Do),Aa.subVectors(Lo,Uo),hr.subVectors(Do,Lo);let n=[0,-Ta.z,Ta.y,0,-Aa.z,Aa.y,0,-hr.z,hr.y,Ta.z,0,-Ta.x,Aa.z,0,-Aa.x,hr.z,0,-hr.x,-Ta.y,Ta.x,0,-Aa.y,Aa.x,0,-hr.y,hr.x,0];return!b0(n,Do,Uo,Lo,$h)||(n=[1,0,0,0,1,0,0,0,1],!b0(n,Do,Uo,Lo,$h))?!1:(tf.crossVectors(Ta,Aa),n=[tf.x,tf.y,tf.z],b0(n,Do,Uo,Lo,$h))}clampPoint(t,n){return n.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Ii).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Ii).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(Ps[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),Ps[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),Ps[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),Ps[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),Ps[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),Ps[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),Ps[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),Ps[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(Ps),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},Ps=[new B,new B,new B,new B,new B,new B,new B,new B],Ii=new B,jh=new Ra,Do=new B,Uo=new B,Lo=new B,Ta=new B,Aa=new B,hr=new B,hc=new B,$h=new B,tf=new B,fr=new B;function b0(e,t,n,i,s){for(let a=0,r=e.length-3;a<=r;a+=3){fr.fromArray(e,a);let o=s.x*Math.abs(fr.x)+s.y*Math.abs(fr.y)+s.z*Math.abs(fr.z),l=t.dot(fr),c=n.dot(fr),f=i.dot(fr);if(Math.max(-Math.max(l,c,f),Math.min(l,c,f))>o)return!1}return!0}var Qe=new B,ef=new It,oC=0,ui=class extends us{constructor(t,n,i=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:oC++}),this.name="",this.array=t,this.itemSize=n,this.count=t!==void 0?t.length/n:0,this.normalized=i,this.usage=c_,this.updateRanges=[],this.gpuType=Hi,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,n){this.updateRanges.push({start:t,count:n})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,n,i){t*=this.itemSize,i*=n.itemSize;for(let s=0,a=this.itemSize;s<a;s++)this.array[t+s]=n.array[i+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let n=0,i=this.count;n<i;n++)ef.fromBufferAttribute(this,n),ef.applyMatrix3(t),this.setXY(n,ef.x,ef.y);else if(this.itemSize===3)for(let n=0,i=this.count;n<i;n++)Qe.fromBufferAttribute(this,n),Qe.applyMatrix3(t),this.setXYZ(n,Qe.x,Qe.y,Qe.z);return this}applyMatrix4(t){for(let n=0,i=this.count;n<i;n++)Qe.fromBufferAttribute(this,n),Qe.applyMatrix4(t),this.setXYZ(n,Qe.x,Qe.y,Qe.z);return this}applyNormalMatrix(t){for(let n=0,i=this.count;n<i;n++)Qe.fromBufferAttribute(this,n),Qe.applyNormalMatrix(t),this.setXYZ(n,Qe.x,Qe.y,Qe.z);return this}transformDirection(t){for(let n=0,i=this.count;n<i;n++)Qe.fromBufferAttribute(this,n),Qe.transformDirection(t),this.setXYZ(n,Qe.x,Qe.y,Qe.z);return this}set(t,n=0){return this.array.set(t,n),this}getComponent(t,n){let i=this.array[t*this.itemSize+n];return this.normalized&&(i=os(i,this.array)),i}setComponent(t,n,i){return this.normalized&&(i=xe(i,this.array)),this.array[t*this.itemSize+n]=i,this}getX(t){let n=this.array[t*this.itemSize];return this.normalized&&(n=os(n,this.array)),n}setX(t,n){return this.normalized&&(n=xe(n,this.array)),this.array[t*this.itemSize]=n,this}getY(t){let n=this.array[t*this.itemSize+1];return this.normalized&&(n=os(n,this.array)),n}setY(t,n){return this.normalized&&(n=xe(n,this.array)),this.array[t*this.itemSize+1]=n,this}getZ(t){let n=this.array[t*this.itemSize+2];return this.normalized&&(n=os(n,this.array)),n}setZ(t,n){return this.normalized&&(n=xe(n,this.array)),this.array[t*this.itemSize+2]=n,this}getW(t){let n=this.array[t*this.itemSize+3];return this.normalized&&(n=os(n,this.array)),n}setW(t,n){return this.normalized&&(n=xe(n,this.array)),this.array[t*this.itemSize+3]=n,this}setXY(t,n,i){return t*=this.itemSize,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array)),this.array[t+0]=n,this.array[t+1]=i,this}setXYZ(t,n,i,s){return t*=this.itemSize,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array),s=xe(s,this.array)),this.array[t+0]=n,this.array[t+1]=i,this.array[t+2]=s,this}setXYZW(t,n,i,s,a){return t*=this.itemSize,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array),s=xe(s,this.array),a=xe(a,this.array)),this.array[t+0]=n,this.array[t+1]=i,this.array[t+2]=s,this.array[t+3]=a,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}};var wc=class extends ui{constructor(t,n,i){super(new Uint16Array(t),n,i)}};var Cc=class extends ui{constructor(t,n,i){super(new Uint32Array(t),n,i)}};var Se=class extends ui{constructor(t,n,i){super(new Float32Array(t),n,i)}},lC=new Ra,fc=new B,E0=new B,gr=class{constructor(t=new B,n=-1){this.isSphere=!0,this.center=t,this.radius=n}set(t,n){return this.center.copy(t),this.radius=n,this}setFromPoints(t,n){let i=this.center;n!==void 0?i.copy(n):lC.setFromPoints(t).getCenter(i);let s=0;for(let a=0,r=t.length;a<r;a++)s=Math.max(s,i.distanceToSquared(t[a]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let n=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=n*n}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,n){let i=this.center.distanceToSquared(t);return n.copy(t),i>this.radius*this.radius&&(n.sub(this.center).normalize(),n.multiplyScalar(this.radius).add(this.center)),n}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;fc.subVectors(t,this.center);let n=fc.lengthSq();if(n>this.radius*this.radius){let i=Math.sqrt(n),s=(i-this.radius)*.5;this.center.addScaledVector(fc,s/i),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(E0.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(fc.copy(t.center).add(E0)),this.expandByPoint(fc.copy(t.center).sub(E0))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},cC=0,Ei=new Oe,T0=new fn,Oo=new B,li=new Ra,dc=new Ra,un=new B,bn=class e extends us{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:cC++}),this.uuid=Ca(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Zw(t)?Cc:wc)(t,1):this.index=t,this}setIndirect(t,n=0){return this.indirect=t,this.indirectOffset=n,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,n){return this.attributes[t]=n,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,n,i=0){this.groups.push({start:t,count:n,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(t,n){this.drawRange.start=t,this.drawRange.count=n}applyMatrix4(t){let n=this.attributes.position;n!==void 0&&(n.applyMatrix4(t),n.needsUpdate=!0);let i=this.attributes.normal;if(i!==void 0){let a=new Bt().getNormalMatrix(t);i.applyNormalMatrix(a),i.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Ei.makeRotationFromQuaternion(t),this.applyMatrix4(Ei),this}rotateX(t){return Ei.makeRotationX(t),this.applyMatrix4(Ei),this}rotateY(t){return Ei.makeRotationY(t),this.applyMatrix4(Ei),this}rotateZ(t){return Ei.makeRotationZ(t),this.applyMatrix4(Ei),this}translate(t,n,i){return Ei.makeTranslation(t,n,i),this.applyMatrix4(Ei),this}scale(t,n,i){return Ei.makeScale(t,n,i),this.applyMatrix4(Ei),this}lookAt(t){return T0.lookAt(t),T0.updateMatrix(),this.applyMatrix4(T0.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Oo).negate(),this.translate(Oo.x,Oo.y,Oo.z),this}setFromPoints(t){let n=this.getAttribute("position");if(n===void 0){let i=[];for(let s=0,a=t.length;s<a;s++){let r=t[s];i.push(r.x,r.y,r.z||0)}this.setAttribute("position",new Se(i,3))}else{let i=Math.min(t.length,n.count);for(let s=0;s<i;s++){let a=t[s];n.setXYZ(s,a.x,a.y,a.z||0)}t.length>n.count&&Dt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),n.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ra);let t=this.attributes.position,n=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ut("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new B(-1/0,-1/0,-1/0),new B(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),n)for(let i=0,s=n.length;i<s;i++){let a=n[i];li.setFromBufferAttribute(a),this.morphTargetsRelative?(un.addVectors(this.boundingBox.min,li.min),this.boundingBox.expandByPoint(un),un.addVectors(this.boundingBox.max,li.max),this.boundingBox.expandByPoint(un)):(this.boundingBox.expandByPoint(li.min),this.boundingBox.expandByPoint(li.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ut('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new gr);let t=this.attributes.position,n=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ut("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new B,1/0);return}if(t){let i=this.boundingSphere.center;if(li.setFromBufferAttribute(t),n)for(let a=0,r=n.length;a<r;a++){let o=n[a];dc.setFromBufferAttribute(o),this.morphTargetsRelative?(un.addVectors(li.min,dc.min),li.expandByPoint(un),un.addVectors(li.max,dc.max),li.expandByPoint(un)):(li.expandByPoint(dc.min),li.expandByPoint(dc.max))}li.getCenter(i);let s=0;for(let a=0,r=t.count;a<r;a++)un.fromBufferAttribute(t,a),s=Math.max(s,i.distanceToSquared(un));if(n)for(let a=0,r=n.length;a<r;a++){let o=n[a],l=this.morphTargetsRelative;for(let c=0,f=o.count;c<f;c++)un.fromBufferAttribute(o,c),l&&(Oo.fromBufferAttribute(t,c),un.add(Oo)),s=Math.max(s,i.distanceToSquared(un))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&Ut('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,n=this.attributes;if(t===null||n.position===void 0||n.normal===void 0||n.uv===void 0){Ut("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let i=n.position,s=n.normal,a=n.uv,r=this.getAttribute("tangent");(r===void 0||r.count!==i.count)&&(r=new ui(new Float32Array(4*i.count),4),this.setAttribute("tangent",r));let o=[],l=[];for(let g=0;g<i.count;g++)o[g]=new B,l[g]=new B;let c=new B,f=new B,p=new B,u=new It,d=new It,v=new It,M=new B,_=new B;function h(g,b,R){c.fromBufferAttribute(i,g),f.fromBufferAttribute(i,b),p.fromBufferAttribute(i,R),u.fromBufferAttribute(a,g),d.fromBufferAttribute(a,b),v.fromBufferAttribute(a,R),f.sub(c),p.sub(c),d.sub(u),v.sub(u);let U=1/(d.x*v.y-v.x*d.y);isFinite(U)&&(M.copy(f).multiplyScalar(v.y).addScaledVector(p,-d.y).multiplyScalar(U),_.copy(p).multiplyScalar(d.x).addScaledVector(f,-v.x).multiplyScalar(U),o[g].add(M),o[b].add(M),o[R].add(M),l[g].add(_),l[b].add(_),l[R].add(_))}let m=this.groups;m.length===0&&(m=[{start:0,count:t.count}]);for(let g=0,b=m.length;g<b;++g){let R=m[g],U=R.start,I=R.count;for(let F=U,D=U+I;F<D;F+=3)h(t.getX(F+0),t.getX(F+1),t.getX(F+2))}let S=new B,y=new B,E=new B,A=new B;function C(g){E.fromBufferAttribute(s,g),A.copy(E);let b=o[g];S.copy(b),S.sub(E.multiplyScalar(E.dot(b))).normalize(),y.crossVectors(A,b);let U=y.dot(l[g])<0?-1:1;r.setXYZW(g,S.x,S.y,S.z,U)}for(let g=0,b=m.length;g<b;++g){let R=m[g],U=R.start,I=R.count;for(let F=U,D=U+I;F<D;F+=3)C(t.getX(F+0)),C(t.getX(F+1)),C(t.getX(F+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,n=this.getAttribute("position");if(n!==void 0){let i=this.getAttribute("normal");if(i===void 0||i.count!==n.count)i=new ui(new Float32Array(n.count*3),3),this.setAttribute("normal",i);else for(let u=0,d=i.count;u<d;u++)i.setXYZ(u,0,0,0);let s=new B,a=new B,r=new B,o=new B,l=new B,c=new B,f=new B,p=new B;if(t)for(let u=0,d=t.count;u<d;u+=3){let v=t.getX(u+0),M=t.getX(u+1),_=t.getX(u+2);s.fromBufferAttribute(n,v),a.fromBufferAttribute(n,M),r.fromBufferAttribute(n,_),f.subVectors(r,a),p.subVectors(s,a),f.cross(p),o.fromBufferAttribute(i,v),l.fromBufferAttribute(i,M),c.fromBufferAttribute(i,_),o.add(f),l.add(f),c.add(f),i.setXYZ(v,o.x,o.y,o.z),i.setXYZ(M,l.x,l.y,l.z),i.setXYZ(_,c.x,c.y,c.z)}else for(let u=0,d=n.count;u<d;u+=3)s.fromBufferAttribute(n,u+0),a.fromBufferAttribute(n,u+1),r.fromBufferAttribute(n,u+2),f.subVectors(r,a),p.subVectors(s,a),f.cross(p),i.setXYZ(u+0,f.x,f.y,f.z),i.setXYZ(u+1,f.x,f.y,f.z),i.setXYZ(u+2,f.x,f.y,f.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let n=0,i=t.count;n<i;n++)un.fromBufferAttribute(t,n),un.normalize(),t.setXYZ(n,un.x,un.y,un.z)}toNonIndexed(){function t(o,l){let c=o.array,f=o.itemSize,p=o.normalized,u=new c.constructor(l.length*f),d=0,v=0;for(let M=0,_=l.length;M<_;M++){o.isInterleavedBufferAttribute?d=l[M]*o.data.stride+o.offset:d=l[M]*f;for(let h=0;h<f;h++)u[v++]=c[d++]}return new ui(u,f,p)}if(this.index===null)return Dt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let n=new e,i=this.index.array,s=this.attributes;for(let o in s){let l=s[o],c=t(l,i);n.setAttribute(o,c)}let a=this.morphAttributes;for(let o in a){let l=[],c=a[o];for(let f=0,p=c.length;f<p;f++){let u=c[f],d=t(u,i);l.push(d)}n.morphAttributes[o]=l}n.morphTargetsRelative=this.morphTargetsRelative;let r=this.groups;for(let o=0,l=r.length;o<l;o++){let c=r[o];n.addGroup(c.start,c.count,c.materialIndex)}return n}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let n=this.index;n!==null&&(t.data.index={type:n.array.constructor.name,array:Array.prototype.slice.call(n.array)});let i=this.attributes;for(let l in i){let c=i[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},a=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],f=[];for(let p=0,u=c.length;p<u;p++){let d=c[p];f.push(d.toJSON(t.data))}f.length>0&&(s[l]=f,a=!0)}a&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let r=this.groups;r.length>0&&(t.data.groups=JSON.parse(JSON.stringify(r)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let n={};this.name=t.name;let i=t.index;i!==null&&this.setIndex(i.clone());let s=t.attributes;for(let c in s){let f=s[c];this.setAttribute(c,f.clone(n))}let a=t.morphAttributes;for(let c in a){let f=[],p=a[c];for(let u=0,d=p.length;u<d;u++)f.push(p[u].clone(n));this.morphAttributes[c]=f}this.morphTargetsRelative=t.morphTargetsRelative;let r=t.groups;for(let c=0,f=r.length;c<f;c++){let p=r[c];this.addGroup(p.start,p.count,p.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}},Pf=class{constructor(t,n){this.isInterleavedBuffer=!0,this.array=t,this.stride=n,this.count=t!==void 0?t.length/n:0,this.usage=c_,this.updateRanges=[],this.version=0,this.uuid=Ca()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,n){this.updateRanges.push({start:t,count:n})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,n,i){t*=this.stride,i*=n.stride;for(let s=0,a=this.stride;s<a;s++)this.array[t+s]=n.array[i+s];return this}set(t,n=0){return this.array.set(t,n),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Ca()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let n=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),i=new this.constructor(n,this.stride);return i.setUsage(this.usage),i}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Ca()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer)));let n={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return n.usage=this.usage,n}},Bn=new B,Rc=class e{constructor(t,n,i,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=n,this.offset=i,this.normalized=s}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let n=0,i=this.data.count;n<i;n++)Bn.fromBufferAttribute(this,n),Bn.applyMatrix4(t),this.setXYZ(n,Bn.x,Bn.y,Bn.z);return this}applyNormalMatrix(t){for(let n=0,i=this.count;n<i;n++)Bn.fromBufferAttribute(this,n),Bn.applyNormalMatrix(t),this.setXYZ(n,Bn.x,Bn.y,Bn.z);return this}transformDirection(t){for(let n=0,i=this.count;n<i;n++)Bn.fromBufferAttribute(this,n),Bn.transformDirection(t),this.setXYZ(n,Bn.x,Bn.y,Bn.z);return this}getComponent(t,n){let i=this.array[t*this.data.stride+this.offset+n];return this.normalized&&(i=os(i,this.array)),i}setComponent(t,n,i){return this.normalized&&(i=xe(i,this.array)),this.data.array[t*this.data.stride+this.offset+n]=i,this}setX(t,n){return this.normalized&&(n=xe(n,this.array)),this.data.array[t*this.data.stride+this.offset]=n,this}setY(t,n){return this.normalized&&(n=xe(n,this.array)),this.data.array[t*this.data.stride+this.offset+1]=n,this}setZ(t,n){return this.normalized&&(n=xe(n,this.array)),this.data.array[t*this.data.stride+this.offset+2]=n,this}setW(t,n){return this.normalized&&(n=xe(n,this.array)),this.data.array[t*this.data.stride+this.offset+3]=n,this}getX(t){let n=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(n=os(n,this.array)),n}getY(t){let n=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(n=os(n,this.array)),n}getZ(t){let n=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(n=os(n,this.array)),n}getW(t){let n=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(n=os(n,this.array)),n}setXY(t,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array)),this.data.array[t+0]=n,this.data.array[t+1]=i,this}setXYZ(t,n,i,s){return t=t*this.data.stride+this.offset,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array),s=xe(s,this.array)),this.data.array[t+0]=n,this.data.array[t+1]=i,this.data.array[t+2]=s,this}setXYZW(t,n,i,s,a){return t=t*this.data.stride+this.offset,this.normalized&&(n=xe(n,this.array),i=xe(i,this.array),s=xe(s,this.array),a=xe(a,this.array)),this.data.array[t+0]=n,this.data.array[t+1]=i,this.data.array[t+2]=s,this.data.array[t+3]=a,this}clone(t){if(t===void 0){Mc("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let n=[];for(let i=0;i<this.count;i++){let s=i*this.data.stride+this.offset;for(let a=0;a<this.itemSize;a++)n.push(this.data.array[s+a])}return new ui(new this.array.constructor(n),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new e(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){Mc("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let n=[];for(let i=0;i<this.count;i++){let s=i*this.data.stride+this.offset;for(let a=0;a<this.itemSize;a++)n.push(this.data.array[s+a])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:n,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},A0=new B,uC=new B,hC=new Bt,Pi=class{constructor(t=new B(1,0,0),n=0){this.isPlane=!0,this.normal=t,this.constant=n}set(t,n){return this.normal.copy(t),this.constant=n,this}setComponents(t,n,i,s){return this.normal.set(t,n,i),this.constant=s,this}setFromNormalAndCoplanarPoint(t,n){return this.normal.copy(t),this.constant=-n.dot(this.normal),this}setFromCoplanarPoints(t,n,i){let s=A0.subVectors(i,n).cross(uC.subVectors(t,n)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,n){return n.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,n,i=!0){let s=t.delta(A0),a=this.normal.dot(s);if(a===0)return this.distanceToPoint(t.start)===0?n.copy(t.start):null;let r=-(t.start.dot(this.normal)+this.constant)/a;return i===!0&&(r<0||r>1)?null:n.copy(t.start).addScaledVector(s,r)}intersectsLine(t){let n=this.distanceToPoint(t.start),i=this.distanceToPoint(t.end);return n<0&&i>0||i<0&&n>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,n){let i=n||hC.getNormalMatrix(t),s=this.coplanarPoint(A0).applyMatrix4(t),a=this.normal.applyMatrix3(i).normalize();return this.constant=-s.dot(a),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}},fC=0,fs=class extends us{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:fC++}),this.uuid=Ca(),this.name="",this.type="Material",this.blending=el,this.side=Oa,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=W0,this.blendDst=q0,this.blendEquation=yr,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ht(0,0,0),this.blendAlpha=0,this.depthFunc=ko,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=m1,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Sf,this.stencilZFail=Sf,this.stencilZPass=Sf,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let n in t){let i=t[n];if(i===void 0){Dt(`Material: parameter '${n}' has value of undefined.`);continue}let s=this[n];if(s===void 0){Dt(`Material: '${n}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(i):s&&s.isVector2&&i&&i.isVector2||s&&s.isEuler&&i&&i.isEuler||s&&s.isVector3&&i&&i.isVector3?s.copy(i):this[n]=i}}toJSON(t){let n=t===void 0||typeof t=="string";n&&(t={textures:{},images:{}});let i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,i.blending=this.blending,i.side=this.side,i.shadowSide=this.shadowSide,i.vertexColors=this.vertexColors,i.opacity=this.opacity,i.transparent=this.transparent,i.blendSrc=this.blendSrc,i.blendDst=this.blendDst,i.blendEquation=this.blendEquation,i.blendSrcAlpha=this.blendSrcAlpha,i.blendDstAlpha=this.blendDstAlpha,i.blendEquationAlpha=this.blendEquationAlpha,i.blendColor=this.blendColor.getHex(),i.blendAlpha=this.blendAlpha,i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,i.colorWrite=this.colorWrite,i.clipIntersection=this.clipIntersection,i.clipShadows=this.clipShadows,i.stencilWriteMask=this.stencilWriteMask,i.stencilFunc=this.stencilFunc,i.stencilRef=this.stencilRef,i.stencilFuncMask=this.stencilFuncMask,i.stencilFail=this.stencilFail,i.stencilZFail=this.stencilZFail,i.stencilZPass=this.stencilZPass,i.stencilWrite=this.stencilWrite,i.polygonOffset=this.polygonOffset,i.polygonOffsetFactor=this.polygonOffsetFactor,i.polygonOffsetUnits=this.polygonOffsetUnits,i.dithering=this.dithering,i.alphaTest=this.alphaTest,i.alphaHash=this.alphaHash,i.alphaToCoverage=this.alphaToCoverage,i.premultipliedAlpha=this.premultipliedAlpha,i.forceSinglePass=this.forceSinglePass,i.allowOverride=this.allowOverride,i.visible=this.visible,i.toneMapped=this.toneMapped,i.name=this.name,this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(i.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(t).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(t).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(t).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(t).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(t).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(i.clippingPlanes=this.clippingPlanes.map(a=>a.toJSON())),this.rotation!==void 0&&(i.rotation=this.rotation),this.depthPacking!==void 0&&(i.depthPacking=this.depthPacking),this.linewidth!==void 0&&(i.linewidth=this.linewidth),this.linecap!==void 0&&(i.linecap=this.linecap),this.linejoin!==void 0&&(i.linejoin=this.linejoin),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.wireframe!==void 0&&(i.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(i.flatShading=this.flatShading),this.fog!==void 0&&(i.fog=this.fog),Object.keys(this.userData).length>0&&(i.userData=this.userData);function s(a){let r=[];for(let o in a){let l=a[o];delete l.metadata,r.push(l)}return r}if(n){let a=s(t.textures),r=s(t.images);a.length>0&&(i.textures=a),r.length>0&&(i.images=r)}return i}fromJSON(t,n){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Ht().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(i=>new Pi().fromJSON(i))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=n[t.map]||null),t.matcap!==void 0&&(this.matcap=n[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=n[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=n[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=n[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let i=t.normalScale;Array.isArray(i)===!1&&(i=[i,i]),this.normalScale=new It().fromArray(i)}return t.displacementMap!==void 0&&(this.displacementMap=n[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=n[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=n[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=n[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=n[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=n[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=n[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=n[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=n[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=n[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=n[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=n[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=n[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=n[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new It().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=n[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=n[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=n[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=n[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=n[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=n[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=n[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let n=t.clippingPlanes,i=null;if(n!==null){let s=n.length;i=new Array(s);for(let a=0;a!==s;++a)i[a]=n[a].clone()}return this.clippingPlanes=i,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}},Zo=class extends fs{constructor(t){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Ht(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},Io,pc=new B,Po=new B,Bo=new B,zo=new It,mc=new It,w1=new Oe,nf=new B,gc=new B,sf=new B,Cb=new It,w0=new It,Rb=new It,Nc=class extends fn{constructor(t=new Zo){if(super(),this.isSprite=!0,this.type="Sprite",Io===void 0){Io=new bn;let n=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),i=new Pf(n,5);Io.setIndex([0,1,2,0,2,3]),Io.setAttribute("position",new Rc(i,3,0,!1)),Io.setAttribute("uv",new Rc(i,2,3,!1))}this.geometry=Io,this.material=t,this.center=new It(.5,.5),this.count=1}intersectsFrustum(t){return t.intersectsSprite(this)}raycast(t,n){t.camera===null&&Ut('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),Po.setFromMatrixScale(this.matrixWorld),w1.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),Bo.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Po.multiplyScalar(-Bo.z);let i=this.material.rotation,s,a;i!==0&&(a=Math.cos(i),s=Math.sin(i));let r=this.center;af(nf.set(-.5,-.5,0),Bo,r,Po,s,a),af(gc.set(.5,-.5,0),Bo,r,Po,s,a),af(sf.set(.5,.5,0),Bo,r,Po,s,a),Cb.set(0,0),w0.set(1,0),Rb.set(1,1);let o=t.ray.intersectTriangle(nf,gc,sf,!1,pc);if(o===null&&(af(gc.set(-.5,.5,0),Bo,r,Po,s,a),w0.set(0,1),o=t.ray.intersectTriangle(nf,sf,gc,!1,pc),o===null))return;let l=t.ray.origin.distanceTo(pc);l<t.near||l>t.far||n.push({distance:l,point:pc.clone(),uv:zs.getInterpolation(pc,nf,gc,sf,Cb,w0,Rb,new It),face:null,object:this})}copy(t,n){return super.copy(t,n),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}};function af(e,t,n,i,s,a){zo.subVectors(e,n).addScalar(.5).multiply(i),s!==void 0?(mc.x=a*zo.x-s*zo.y,mc.y=s*zo.x+a*zo.y):mc.copy(zo),e.copy(t),e.x+=mc.x,e.y+=mc.y,e.applyMatrix4(w1)}var Bs=new B,C0=new B,rf=new B,of=new B,Dc=class{constructor(t=new B,n=new B(0,0,-1)){this.origin=t,this.direction=n}set(t,n){return this.origin.copy(t),this.direction.copy(n),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,n){return n.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Bs)),this}closestPointToPoint(t,n){n.subVectors(t,this.origin);let i=n.dot(this.direction);return i<0?n.copy(this.origin):n.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let n=Bs.subVectors(t,this.origin).dot(this.direction);return n<0?this.origin.distanceToSquared(t):(Bs.copy(this.origin).addScaledVector(this.direction,n),Bs.distanceToSquared(t))}distanceSqToSegment(t,n,i,s){C0.copy(t).add(n).multiplyScalar(.5),rf.copy(n).sub(t).normalize(),of.copy(this.origin).sub(C0);let a=t.distanceTo(n)*.5,r=-this.direction.dot(rf),o=of.dot(this.direction),l=-of.dot(rf),c=of.lengthSq(),f=Math.abs(1-r*r),p,u,d,v;if(f>0)if(p=r*l-o,u=r*o-l,v=a*f,p>=0)if(u>=-v)if(u<=v){let M=1/f;p*=M,u*=M,d=p*(p+r*u+2*o)+u*(r*p+u+2*l)+c}else u=a,p=Math.max(0,-(r*u+o)),d=-p*p+u*(u+2*l)+c;else u=-a,p=Math.max(0,-(r*u+o)),d=-p*p+u*(u+2*l)+c;else u<=-v?(p=Math.max(0,-(-r*a+o)),u=p>0?-a:Math.min(Math.max(-a,-l),a),d=-p*p+u*(u+2*l)+c):u<=v?(p=0,u=Math.min(Math.max(-a,-l),a),d=u*(u+2*l)+c):(p=Math.max(0,-(r*a+o)),u=p>0?a:Math.min(Math.max(-a,-l),a),d=-p*p+u*(u+2*l)+c);else u=r>0?-a:a,p=Math.max(0,-(r*u+o)),d=-p*p+u*(u+2*l)+c;return i&&i.copy(this.origin).addScaledVector(this.direction,p),s&&s.copy(C0).addScaledVector(rf,u),d}intersectSphere(t,n){if(t.radius<0)return null;Bs.subVectors(t.center,this.origin);let i=Bs.dot(this.direction),s=Bs.dot(Bs)-i*i,a=t.radius*t.radius;if(s>a)return null;let r=Math.sqrt(a-s),o=i-r,l=i+r;return l<0?null:o<0?this.at(l,n):this.at(o,n)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let n=t.normal.dot(this.direction);if(n===0)return t.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(t.normal)+t.constant)/n;return i>=0?i:null}intersectPlane(t,n){let i=this.distanceToPlane(t);return i===null?null:this.at(i,n)}intersectsPlane(t){let n=t.distanceToPoint(this.origin);return n===0||t.normal.dot(this.direction)*n<0}intersectBox(t,n){let i,s,a,r,o,l,c=1/this.direction.x,f=1/this.direction.y,p=1/this.direction.z,u=this.origin;return c>=0?(i=(t.min.x-u.x)*c,s=(t.max.x-u.x)*c):(i=(t.max.x-u.x)*c,s=(t.min.x-u.x)*c),f>=0?(a=(t.min.y-u.y)*f,r=(t.max.y-u.y)*f):(a=(t.max.y-u.y)*f,r=(t.min.y-u.y)*f),i>r||a>s||((a>i||isNaN(i))&&(i=a),(r<s||isNaN(s))&&(s=r),p>=0?(o=(t.min.z-u.z)*p,l=(t.max.z-u.z)*p):(o=(t.max.z-u.z)*p,l=(t.min.z-u.z)*p),i>l||o>s)||((o>i||i!==i)&&(i=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(i>=0?i:s,n)}intersectsBox(t){return this.intersectBox(t,Bs)!==null}intersectTriangle(t,n,i,s,a){let r=this.origin,o=this.direction,l=o.x,c=o.y,f=o.z,p=t.x-r.x,u=t.y-r.y,d=t.z-r.z,v=n.x-r.x,M=n.y-r.y,_=n.z-r.z,h=i.x-r.x,m=i.y-r.y,S=i.z-r.z,y=Math.abs(l),E=Math.abs(c),A=Math.abs(f),C,g,b,R,U,I,F,D,G,Y,Z,it;if(y>=E&&y>=A?(b=l,I=p,G=v,it=h,l>=0?(C=c,g=f,R=u,U=d,F=M,D=_,Y=m,Z=S):(C=f,g=c,R=d,U=u,F=_,D=M,Y=S,Z=m)):E>=A?(b=c,I=u,G=M,it=m,c>=0?(C=f,g=l,R=d,U=p,F=_,D=v,Y=S,Z=h):(C=l,g=f,R=p,U=d,F=v,D=_,Y=h,Z=S)):(b=f,I=d,G=_,it=S,f>=0?(C=l,g=c,R=p,U=u,F=v,D=M,Y=h,Z=m):(C=c,g=l,R=u,U=p,F=M,D=v,Y=m,Z=h)),b===0)return null;let W=C/b,$=g/b,et=1/b,At=R-W*I,St=U-$*I,ae=F-W*G,Wt=D-$*G,ne=Y-W*it,q=Z-$*it,tt=ne*Wt-q*ae,vt=At*q-St*ne,Ot=ae*St-Wt*At;if(s){if(tt<0||vt<0||Ot<0)return null}else if((tt<0||vt<0||Ot<0)&&(tt>0||vt>0||Ot>0))return null;let _t=tt+vt+Ot;if(_t===0)return null;let Gt=et*(tt*I+vt*G+Ot*it);return(_t>0?Gt<0:Gt>0)?null:this.at(Gt/_t,a)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Uc=class extends fs{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ht(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Hs,this.combine=Y0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},Nb=new Oe,dr=new Dc,lf=new gr,Db=new B,cf=new B,uf=new B,hf=new B,R0=new B,ff=new B,Ub=new B,df=new B,Vt=class extends fn{constructor(t=new bn,n=new Uc){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=n,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,n){return super.copy(t,n),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let n=this.geometry.morphAttributes,i=Object.keys(n);if(i.length>0){let s=n[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let a=0,r=s.length;a<r;a++){let o=s[a].name||String(a);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=a}}}}getVertexPosition(t,n){let i=this.geometry,s=i.attributes.position,a=i.morphAttributes.position,r=i.morphTargetsRelative;n.fromBufferAttribute(s,t);let o=this.morphTargetInfluences;if(a&&o){ff.set(0,0,0);for(let l=0,c=a.length;l<c;l++){let f=o[l],p=a[l];f!==0&&(R0.fromBufferAttribute(p,t),r?ff.addScaledVector(R0,f):ff.addScaledVector(R0.sub(n),f))}n.add(ff)}return n}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,n){let i=this.geometry,s=this.material,a=this.matrixWorld;s!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),lf.copy(i.boundingSphere),lf.applyMatrix4(a),dr.copy(t.ray).recast(t.near),!(lf.containsPoint(dr.origin)===!1&&(dr.intersectSphere(lf,Db)===null||dr.origin.distanceToSquared(Db)>(t.far-t.near)**2))&&(Nb.copy(a).invert(),dr.copy(t.ray).applyMatrix4(Nb),!(i.boundingBox!==null&&dr.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(t,n,dr)))}_computeIntersections(t,n,i){let s,a=this.geometry,r=this.material,o=a.index,l=a.attributes.position,c=a.attributes.uv,f=a.attributes.uv1,p=a.attributes.normal,u=a.groups,d=a.drawRange;if(o!==null)if(Array.isArray(r))for(let v=0,M=u.length;v<M;v++){let _=u[v],h=r[_.materialIndex],m=Math.max(_.start,d.start),S=Math.min(o.count,Math.min(_.start+_.count,d.start+d.count));for(let y=m,E=S;y<E;y+=3){let A=o.getX(y),C=o.getX(y+1),g=o.getX(y+2);s=pf(this,h,t,i,c,f,p,A,C,g),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=_.materialIndex,n.push(s))}}else{let v=Math.max(0,d.start),M=Math.min(o.count,d.start+d.count);for(let _=v,h=M;_<h;_+=3){let m=o.getX(_),S=o.getX(_+1),y=o.getX(_+2);s=pf(this,r,t,i,c,f,p,m,S,y),s&&(s.faceIndex=Math.floor(_/3),n.push(s))}}else if(l!==void 0)if(Array.isArray(r))for(let v=0,M=u.length;v<M;v++){let _=u[v],h=r[_.materialIndex],m=Math.max(_.start,d.start),S=Math.min(l.count,Math.min(_.start+_.count,d.start+d.count));for(let y=m,E=S;y<E;y+=3){let A=y,C=y+1,g=y+2;s=pf(this,h,t,i,c,f,p,A,C,g),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=_.materialIndex,n.push(s))}}else{let v=Math.max(0,d.start),M=Math.min(l.count,d.start+d.count);for(let _=v,h=M;_<h;_+=3){let m=_,S=_+1,y=_+2;s=pf(this,r,t,i,c,f,p,m,S,y),s&&(s.faceIndex=Math.floor(_/3),n.push(s))}}}};function dC(e,t,n,i,s,a,r,o){let l;if(t.side===Fn?l=i.intersectTriangle(r,a,s,!0,o):l=i.intersectTriangle(s,a,r,t.side===Oa,o),l===null)return null;df.copy(o),df.applyMatrix4(e.matrixWorld);let c=n.ray.origin.distanceTo(df);return c<n.near||c>n.far?null:{distance:c,point:df.clone(),object:e}}function pf(e,t,n,i,s,a,r,o,l,c){e.getVertexPosition(o,cf),e.getVertexPosition(l,uf),e.getVertexPosition(c,hf);let f=dC(e,t,n,i,cf,uf,hf,Ub);if(f){let p=new B;zs.getBarycoord(Ub,cf,uf,hf,p),s&&(f.uv=zs.getInterpolatedAttribute(s,o,l,c,p,new It)),a&&(f.uv1=zs.getInterpolatedAttribute(a,o,l,c,p,new It)),r&&(f.normal=zs.getInterpolatedAttribute(r,o,l,c,p,new B),f.normal.dot(i.direction)>0&&f.normal.multiplyScalar(-1));let u={a:o,b:l,c,normal:new B,materialIndex:0};zs.getNormal(cf,uf,hf,u.normal),f.face=u,f.barycoord=p}return f}var Bf=class extends zn{constructor(t=null,n=1,i=1,s,a,r,o,l,c=hn,f=hn,p,u){super(null,r,o,l,c,f,s,a,p,u),this.isDataTexture=!0,this.image={data:t,width:n,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var pr=new gr,pC=new It(.5,.5),mf=new B,Jo=class{constructor(t=new Pi,n=new Pi,i=new Pi,s=new Pi,a=new Pi,r=new Pi){this.planes=[t,n,i,s,a,r]}set(t,n,i,s,a,r){let o=this.planes;return o[0].copy(t),o[1].copy(n),o[2].copy(i),o[3].copy(s),o[4].copy(a),o[5].copy(r),this}copy(t){let n=this.planes;for(let i=0;i<6;i++)n[i].copy(t.planes[i]);return this}setFromProjectionMatrix(t,n=Bi,i=!1){let s=this.planes,a=t.elements,r=a[0],o=a[1],l=a[2],c=a[3],f=a[4],p=a[5],u=a[6],d=a[7],v=a[8],M=a[9],_=a[10],h=a[11],m=a[12],S=a[13],y=a[14],E=a[15];if(s[0].setComponents(c-r,d-f,h-v,E-m).normalize(),s[1].setComponents(c+r,d+f,h+v,E+m).normalize(),s[2].setComponents(c+o,d+p,h+M,E+S).normalize(),s[3].setComponents(c-o,d-p,h-M,E-S).normalize(),i)s[4].setComponents(l,u,_,y).normalize(),s[5].setComponents(c-l,d-u,h-_,E-y).normalize();else if(s[4].setComponents(c-l,d-u,h-_,E-y).normalize(),n===Bi)s[5].setComponents(c+l,d+u,h+_,E+y).normalize();else if(n===Xo)s[5].setComponents(l,u,_,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+n);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),pr.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let n=t.geometry;n.boundingSphere===null&&n.computeBoundingSphere(),pr.copy(n.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(pr)}intersectsSprite(t){pr.center.set(0,0,0);let n=pC.distanceTo(t.center);return pr.radius=.7071067811865476+n,pr.applyMatrix4(t.matrixWorld),this.intersectsSphere(pr)}intersectsSphere(t){let n=this.planes,i=t.center,s=-t.radius;for(let a=0;a<6;a++)if(n[a].distanceToPoint(i)<s)return!1;return!0}intersectsBox(t){let n=this.planes;for(let i=0;i<6;i++){let s=n[i];if(mf.x=s.normal.x>0?t.max.x:t.min.x,mf.y=s.normal.y>0?t.max.y:t.min.y,mf.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(mf)<0)return!1}return!0}containsPoint(t){let n=this.planes;for(let i=0;i<6;i++)if(n[i].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var Lc=class extends fs{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Ht(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},zf=new B,Ff=new B,Lb=new Oe,_c=new Dc,gf=new gr,N0=new B,Ob=new B,Hf=class extends fn{constructor(t=new bn,n=new Lc){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=n,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,n){return super.copy(t,n),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let n=t.attributes.position,i=[0];for(let s=1,a=n.count;s<a;s++)zf.fromBufferAttribute(n,s-1),Ff.fromBufferAttribute(n,s),i[s]=i[s-1],i[s]+=zf.distanceTo(Ff);t.setAttribute("lineDistance",new Se(i,1))}else Dt("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,n){let i=this.geometry,s=this.matrixWorld,a=t.params.Line.threshold,r=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),gf.copy(i.boundingSphere),gf.applyMatrix4(s),gf.radius+=a,t.ray.intersectsSphere(gf)===!1)return;Lb.copy(s).invert(),_c.copy(t.ray).applyMatrix4(Lb);let o=a/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,f=i.index,u=i.attributes.position;if(f!==null){let d=Math.max(0,r.start),v=Math.min(f.count,r.start+r.count);for(let M=d,_=v-1;M<_;M+=c){let h=f.getX(M),m=f.getX(M+1),S=_f(this,t,_c,l,h,m,M);S&&n.push(S)}if(this.isLineLoop){let M=f.getX(v-1),_=f.getX(d),h=_f(this,t,_c,l,M,_,v-1);h&&n.push(h)}}else{let d=Math.max(0,r.start),v=Math.min(u.count,r.start+r.count);for(let M=d,_=v-1;M<_;M+=c){let h=_f(this,t,_c,l,M,M+1,M);h&&n.push(h)}if(this.isLineLoop){let M=_f(this,t,_c,l,v-1,d,v-1);M&&n.push(M)}}}updateMorphTargets(){let n=this.geometry.morphAttributes,i=Object.keys(n);if(i.length>0){let s=n[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let a=0,r=s.length;a<r;a++){let o=s[a].name||String(a);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=a}}}}};function _f(e,t,n,i,s,a,r){let o=e.geometry.attributes.position;if(zf.fromBufferAttribute(o,s),Ff.fromBufferAttribute(o,a),n.distanceSqToSegment(zf,Ff,N0,Ob)>i)return;N0.applyMatrix4(e.matrixWorld);let c=t.ray.origin.distanceTo(N0);if(!(c<t.near||c>t.far))return{distance:c,point:Ob.clone().applyMatrix4(e.matrixWorld),index:r,face:null,faceIndex:null,barycoord:null,object:e}}var Ib=new B,Pb=new B,Vf=class extends Hf{constructor(t,n){super(t,n),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let n=t.attributes.position,i=[];for(let s=0,a=n.count;s<a;s+=2)Ib.fromBufferAttribute(n,s),Pb.fromBufferAttribute(n,s+1),i[s]=s===0?0:i[s-1],i[s+1]=i[s]+Ib.distanceTo(Pb);t.setAttribute("lineDistance",new Se(i,1))}else Dt("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var Oc=class extends zn{constructor(t=[],n=Ia,i,s,a,r,o,l,c,f){super(t,n,i,s,a,r,o,l,c,f),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}},Ic=class extends zn{constructor(t,n,i,s,a,r,o,l,c){super(t,n,i,s,a,r,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};var Na=class extends zn{constructor(t,n,i=Fi,s,a,r,o=hn,l=hn,c,f=cs,p=1){if(f!==cs&&f!==Ba)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let u={width:t,height:n,depth:p};super(u,s,a,r,o,l,f,i,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new qo(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let n=super.toJSON(t);return n.compareFunction=this.compareFunction,n}},Gf=class extends Na{constructor(t,n=Fi,i=Ia,s,a,r=hn,o=hn,l,c=cs){let f={width:t,height:t,depth:1},p=[f,f,f,f,f,f];super(t,t,n,i,s,a,r,o,l,c),this.image=p,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},Pc=class extends zn{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},en=class e extends bn{constructor(t=1,n=1,i=1,s=1,a=1,r=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:n,depth:i,widthSegments:s,heightSegments:a,depthSegments:r};let o=this;s=Math.floor(s),a=Math.floor(a),r=Math.floor(r);let l=[],c=[],f=[],p=[],u=0,d=0;v("z","y","x",-1,-1,i,n,t,r,a,0),v("z","y","x",1,-1,i,n,-t,r,a,1),v("x","z","y",1,1,t,i,n,s,r,2),v("x","z","y",1,-1,t,i,-n,s,r,3),v("x","y","z",1,-1,t,n,i,s,a,4),v("x","y","z",-1,-1,t,n,-i,s,a,5),this.setIndex(l),this.setAttribute("position",new Se(c,3)),this.setAttribute("normal",new Se(f,3)),this.setAttribute("uv",new Se(p,2));function v(M,_,h,m,S,y,E,A,C,g,b){let R=y/C,U=E/g,I=y/2,F=E/2,D=A/2,G=C+1,Y=g+1,Z=0,it=0,W=new B;for(let $=0;$<Y;$++){let et=$*U-F;for(let At=0;At<G;At++){let St=At*R-I;W[M]=St*m,W[_]=et*S,W[h]=D,c.push(W.x,W.y,W.z),W[M]=0,W[_]=0,W[h]=A>0?1:-1,f.push(W.x,W.y,W.z),p.push(At/C),p.push(1-$/g),Z+=1}}for(let $=0;$<g;$++)for(let et=0;et<C;et++){let At=u+et+G*$,St=u+et+G*($+1),ae=u+(et+1)+G*($+1),Wt=u+(et+1)+G*$;l.push(At,St,Wt),l.push(St,ae,Wt),it+=6}o.addGroup(d,it,b),d+=it,u+=Z}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};var Zn=class e extends bn{constructor(t=1,n=1,i=1,s=32,a=1,r=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:n,height:i,radialSegments:s,heightSegments:a,openEnded:r,thetaStart:o,thetaLength:l};let c=this;s=Math.floor(s),a=Math.floor(a);let f=[],p=[],u=[],d=[],v=0,M=[],_=i/2,h=0;m(),r===!1&&(t>0&&S(!0),n>0&&S(!1)),this.setIndex(f),this.setAttribute("position",new Se(p,3)),this.setAttribute("normal",new Se(u,3)),this.setAttribute("uv",new Se(d,2));function m(){let y=new B,E=new B,A=0,C=(n-t)/i;for(let g=0;g<=a;g++){let b=[],R=g/a,U=R*(n-t)+t;for(let I=0;I<=s;I++){let F=I/s,D=F*l+o,G=Math.sin(D),Y=Math.cos(D);E.x=U*G,E.y=-R*i+_,E.z=U*Y,p.push(E.x,E.y,E.z),y.set(G,C,Y).normalize(),u.push(y.x,y.y,y.z),d.push(F,1-R),b.push(v++)}M.push(b)}for(let g=0;g<s;g++)for(let b=0;b<a;b++){let R=M[b][g],U=M[b+1][g],I=M[b+1][g+1],F=M[b][g+1];(t>0||b!==0)&&(f.push(R,U,F),A+=3),(n>0||b!==a-1)&&(f.push(U,I,F),A+=3)}c.addGroup(h,A,0),h+=A}function S(y){let E=v,A=new It,C=new B,g=0,b=y===!0?t:n,R=y===!0?1:-1;for(let I=1;I<=s;I++)p.push(0,_*R,0),u.push(0,R,0),d.push(.5,.5),v++;let U=v;for(let I=0;I<=s;I++){let D=I/s*l+o,G=Math.cos(D),Y=Math.sin(D);C.x=b*Y,C.y=_*R,C.z=b*G,p.push(C.x,C.y,C.z),u.push(0,R,0),A.x=G*.5+.5,A.y=Y*.5*R+.5,d.push(A.x,A.y),v++}for(let I=0;I<s;I++){let F=E+I,D=U+I;y===!0?f.push(D,D+1,F):f.push(D+1,D,F),g+=3}c.addGroup(h,g,y===!0?1:2),h+=g}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ko=class e extends Zn{constructor(t=1,n=1,i=32,s=1,a=!1,r=0,o=Math.PI*2){super(0,t,n,i,s,a,r,o),this.type="ConeGeometry",this.parameters={radius:t,height:n,radialSegments:i,heightSegments:s,openEnded:a,thetaStart:r,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},kf=class e extends bn{constructor(t=[],n=[],i=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:n,radius:i,detail:s};let a=[],r=[];o(s),c(i),f(),this.setAttribute("position",new Se(a,3)),this.setAttribute("normal",new Se(a.slice(),3)),this.setAttribute("uv",new Se(r,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function o(m){let S=new B,y=new B,E=new B;for(let A=0;A<n.length;A+=3)d(n[A+0],S),d(n[A+1],y),d(n[A+2],E),l(S,y,E,m)}function l(m,S,y,E){let A=E+1,C=[];for(let g=0;g<=A;g++){C[g]=[];let b=m.clone().lerp(y,g/A),R=S.clone().lerp(y,g/A),U=A-g;for(let I=0;I<=U;I++)I===0&&g===A?C[g][I]=b:C[g][I]=b.clone().lerp(R,I/U)}for(let g=0;g<A;g++)for(let b=0;b<2*(A-g)-1;b++){let R=Math.floor(b/2);b%2===0?(u(C[g][R+1]),u(C[g+1][R]),u(C[g][R])):(u(C[g][R+1]),u(C[g+1][R+1]),u(C[g+1][R]))}}function c(m){let S=new B;for(let y=0;y<a.length;y+=3)S.x=a[y+0],S.y=a[y+1],S.z=a[y+2],S.normalize().multiplyScalar(m),a[y+0]=S.x,a[y+1]=S.y,a[y+2]=S.z}function f(){let m=new B;for(let S=0;S<a.length;S+=3){m.x=a[S+0],m.y=a[S+1],m.z=a[S+2];let y=_(m)/2/Math.PI+.5,E=h(m)/Math.PI+.5;r.push(y,1-E)}v(),p()}function p(){for(let m=0;m<r.length;m+=6){let S=r[m+0],y=r[m+2],E=r[m+4],A=Math.max(S,y,E),C=Math.min(S,y,E);A>.9&&C<.1&&(S<.2&&(r[m+0]+=1),y<.2&&(r[m+2]+=1),E<.2&&(r[m+4]+=1))}}function u(m){a.push(m.x,m.y,m.z)}function d(m,S){let y=m*3;S.x=t[y+0],S.y=t[y+1],S.z=t[y+2]}function v(){let m=new B,S=new B,y=new B,E=new B,A=new It,C=new It,g=new It;for(let b=0,R=0;b<a.length;b+=9,R+=6){m.set(a[b+0],a[b+1],a[b+2]),S.set(a[b+3],a[b+4],a[b+5]),y.set(a[b+6],a[b+7],a[b+8]),A.set(r[R+0],r[R+1]),C.set(r[R+2],r[R+3]),g.set(r[R+4],r[R+5]),E.copy(m).add(S).add(y).divideScalar(3);let U=_(E);M(A,R+0,m,U),M(C,R+2,S,U),M(g,R+4,y,U)}}function M(m,S,y,E){E<0&&m.x===1&&(r[S]=m.x-1),y.x===0&&y.z===0&&(r[S]=E/2/Math.PI+.5)}function _(m){return Math.atan2(m.z,-m.x)}function h(m){return Math.atan2(-m.y,Math.sqrt(m.x*m.x+m.z*m.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.vertices,t.indices,t.radius,t.detail)}};var Bc=class e extends kf{constructor(t=1,n=0){let i=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],s=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(i,s,t,n),this.type="OctahedronGeometry",this.parameters={radius:t,detail:n}}static fromJSON(t){return new e(t.radius,t.detail)}},zc=class e extends bn{constructor(t=1,n=1,i=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:n,widthSegments:i,heightSegments:s};let a=t/2,r=n/2,o=Math.floor(i),l=Math.floor(s),c=o+1,f=l+1,p=t/o,u=n/l,d=[],v=[],M=[],_=[];for(let h=0;h<f;h++){let m=h*u-r;for(let S=0;S<c;S++){let y=S*p-a;v.push(y,-m,0),M.push(0,0,1),_.push(S/o),_.push(1-h/l)}}for(let h=0;h<l;h++)for(let m=0;m<o;m++){let S=m+c*h,y=m+c*(h+1),E=m+1+c*(h+1),A=m+1+c*h;d.push(S,y,A),d.push(y,E,A)}this.setIndex(d),this.setAttribute("position",new Se(v,3)),this.setAttribute("normal",new Se(M,3)),this.setAttribute("uv",new Se(_,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}};var Qo=class e extends bn{constructor(t=1,n=32,i=16,s=0,a=Math.PI*2,r=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:n,heightSegments:i,phiStart:s,phiLength:a,thetaStart:r,thetaLength:o},n=Math.max(3,Math.floor(n)),i=Math.max(2,Math.floor(i));let l=Math.min(r+o,Math.PI),c=0,f=[],p=new B,u=new B,d=[],v=[],M=[],_=[];for(let h=0;h<=i;h++){let m=[],S=h/i,y=r+S*o,E=t*Math.cos(y),A=Math.sqrt(t*t-E*E),C=0;h===0&&r===0?C=.5/n:h===i&&l===Math.PI&&(C=-.5/n);for(let g=0;g<=n;g++){let b=g/n,R=s+b*a;p.x=-A*Math.cos(R),p.y=E,p.z=A*Math.sin(R),v.push(p.x,p.y,p.z),u.copy(p).normalize(),M.push(u.x,u.y,u.z),_.push(b+C,1-S),m.push(c++)}f.push(m)}for(let h=0;h<i;h++)for(let m=0;m<n;m++){let S=f[h][m+1],y=f[h][m],E=f[h+1][m],A=f[h+1][m+1];(h!==0||r>0)&&d.push(S,y,A),(h!==i-1||l<Math.PI)&&d.push(y,E,A)}this.setIndex(d),this.setAttribute("position",new Se(v,3)),this.setAttribute("normal",new Se(M,3)),this.setAttribute("uv",new Se(_,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};var _r=class e extends bn{constructor(t=1,n=.4,i=12,s=48,a=Math.PI*2,r=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:n,radialSegments:i,tubularSegments:s,arc:a,thetaStart:r,thetaLength:o},i=Math.floor(i),s=Math.floor(s);let l=[],c=[],f=[],p=[],u=new B,d=new B,v=new B;for(let M=0;M<=i;M++){let _=r+M/i*o;for(let h=0;h<=s;h++){let m=h/s*a;d.x=(t+n*Math.cos(_))*Math.cos(m),d.y=(t+n*Math.cos(_))*Math.sin(m),d.z=n*Math.sin(_),c.push(d.x,d.y,d.z),u.x=t*Math.cos(m),u.y=t*Math.sin(m),v.subVectors(d,u).normalize(),f.push(v.x,v.y,v.z),p.push(h/s),p.push(M/i)}}for(let M=1;M<=i;M++)for(let _=1;_<=s;_++){let h=(s+1)*M+_-1,m=(s+1)*(M-1)+_-1,S=(s+1)*(M-1)+_,y=(s+1)*M+_;l.push(h,m,y),l.push(m,S,y)}this.setIndex(l),this.setAttribute("position",new Se(c,3)),this.setAttribute("normal",new Se(f,3)),this.setAttribute("uv",new Se(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}};function Sr(e){let t={};for(let n in e){t[n]={};for(let i in e[n]){let s=e[n][i];if(Bb(s))s.isRenderTargetTexture?(Dt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[n][i]=null):t[n][i]=s.clone();else if(Array.isArray(s))if(Bb(s[0])){let a=[];for(let r=0,o=s.length;r<o;r++)a[r]=s[r].clone();t[n][i]=a}else t[n][i]=s.slice();else t[n][i]=s}}return t}function Nn(e){let t={};for(let n=0;n<e.length;n++){let i=Sr(e[n]);for(let s in i)t[s]=i[s]}return t}function Bb(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function mC(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function h_(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:te.workingColorSpace}var C1={clone:Sr,merge:Nn},gC=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,_C=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,hi=class extends fs{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=gC,this.fragmentShader=_C,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=Sr(t.uniforms),this.uniformsGroups=mC(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let n=super.toJSON(t);n.glslVersion=this.glslVersion,n.uniforms={};for(let s in this.uniforms){let r=this.uniforms[s].value;r&&r.isTexture?n.uniforms[s]={type:"t",value:r.toJSON(t).uuid}:r&&r.isColor?n.uniforms[s]={type:"c",value:r.getHex()}:r&&r.isVector2?n.uniforms[s]={type:"v2",value:r.toArray()}:r&&r.isVector3?n.uniforms[s]={type:"v3",value:r.toArray()}:r&&r.isVector4?n.uniforms[s]={type:"v4",value:r.toArray()}:r&&r.isMatrix3?n.uniforms[s]={type:"m3",value:r.toArray()}:r&&r.isMatrix4?n.uniforms[s]={type:"m4",value:r.toArray()}:n.uniforms[s]={value:r}}Object.keys(this.defines).length>0&&(n.defines=this.defines),n.vertexShader=this.vertexShader,n.fragmentShader=this.fragmentShader,n.lights=this.lights,n.clipping=this.clipping;let i={};for(let s in this.extensions)this.extensions[s]===!0&&(i[s]=!0);return Object.keys(i).length>0&&(n.extensions=i),n}fromJSON(t,n){if(super.fromJSON(t,n),t.uniforms!==void 0)for(let i in t.uniforms){let s=t.uniforms[i];switch(this.uniforms[i]={},s.type){case"t":this.uniforms[i].value=n[s.value]||null;break;case"c":this.uniforms[i].value=new Ht().setHex(s.value);break;case"v2":this.uniforms[i].value=new It().fromArray(s.value);break;case"v3":this.uniforms[i].value=new B().fromArray(s.value);break;case"v4":this.uniforms[i].value=new ze().fromArray(s.value);break;case"m3":this.uniforms[i].value=new Bt().fromArray(s.value);break;case"m4":this.uniforms[i].value=new Oe().fromArray(s.value);break;default:this.uniforms[i].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let i in t.extensions)this.extensions[i]=t.extensions[i];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},Xf=class extends hi{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},Ie=class extends fs{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ht(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ht(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Wd,this.normalScale=new It(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Hs,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}};var Wf=class extends fs{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=d1,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},qf=class extends fs{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function Fo(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT=="number"?new t(e):Array.prototype.slice.call(e)}function D0(e){return e!==void 0&&e.inTangents!==void 0&&e.outTangents!==void 0}var Da=class{constructor(t,n,i,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new n.constructor(i),this.sampleValues=n,this.valueSize=i,this.settings=null,this.DefaultSettings_={}}evaluate(t){let n=this.parameterPositions,i=this._cachedIndex,s=n[i],a=n[i-1];t:{e:{let r;n:{i:if(!(t<s)){for(let o=i+2;;){if(s===void 0){if(t<a)break i;return i=n.length,this._cachedIndex=i,this.copySampleValue_(i-1)}if(i===o)break;if(a=s,s=n[++i],t<s)break e}r=n.length;break n}if(!(t>=a)){let o=n[1];t<o&&(i=2,a=o);for(let l=i-2;;){if(a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===l)break;if(s=a,a=n[--i-1],t>=a)break e}r=i,i=0;break n}break t}for(;i<r;){let o=i+r>>>1;t<n[o]?r=o:i=o+1}if(s=n[i],a=n[i-1],a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return i=n.length,this._cachedIndex=i,this.copySampleValue_(i-1)}this._cachedIndex=i,this.intervalChanged_(i,a,s)}return this.interpolate_(i,a,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let n=this.resultBuffer,i=this.sampleValues,s=this.valueSize,a=t*s;for(let r=0;r!==s;++r)n[r]=i[a+r];return n}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Yf=class extends Da{constructor(t,n,i,s){super(t,n,i,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:O0,endingEnd:O0}}intervalChanged_(t,n,i){let s=this.parameterPositions,a=t-2,r=t+1,o=s[a],l=s[r];if(o===void 0)switch(this.getSettings_().endingStart){case I0:a=t,o=2*n-i;break;case P0:a=s.length-2,o=n+s[a]-s[a+1];break;default:a=t,o=i}if(l===void 0)switch(this.getSettings_().endingEnd){case I0:r=t,l=2*i-n;break;case P0:r=1,l=i+s[1]-s[0];break;default:r=t-1,l=n}let c=(i-n)*.5,f=this.valueSize;this._weightPrev=c/(n-o),this._weightNext=c/(l-i),this._offsetPrev=a*f,this._offsetNext=r*f}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=this._offsetPrev,p=this._offsetNext,u=this._weightPrev,d=this._weightNext,v=(i-n)/(s-n),M=v*v,_=M*v,h=-u*_+2*u*M-u*v,m=(1+u)*_+(-1.5-2*u)*M+(-.5+u)*v+1,S=(-1-d)*_+(1.5+d)*M+.5*v,y=d*_-d*M;for(let E=0;E!==o;++E)a[E]=h*r[f+E]+m*r[c+E]+S*r[l+E]+y*r[p+E];return a}},Zf=class extends Da{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=(i-n)/(s-n),p=1-f;for(let u=0;u!==o;++u)a[u]=r[c+u]*p+r[l+u]*f;return a}},Jf=class extends Da{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Kf=class extends Da{interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=this.inTangents,p=this.outTangents;if(!f||!p){let v=(i-n)/(s-n),M=1-v;for(let _=0;_!==o;++_)a[_]=r[c+_]*M+r[l+_]*v;return a}let u=o*2,d=t-1;for(let v=0;v!==o;++v){let M=r[c+v],_=r[l+v],h=d*u+v*2,m=p[h],S=p[h+1],y=t*u+v*2,E=f[y],A=f[y+1],C=yC(i,n,m,E,s);a[v]=R1(C,M,S,A,_)}return a}};function R1(e,t,n,i,s){let a=1-e;return a*a*a*t+3*a*a*e*n+3*a*e*e*i+e*e*e*s}function vC(e,t,n,i,s){let a=1-e;return 3*a*a*(n-t)+6*a*e*(i-n)+3*e*e*(s-i)}function yC(e,t,n,i,s){let a=(e-t)/(s-t);for(let r=0;r<8;r++){let o=R1(a,t,n,i,s)-e;if(Math.abs(o)<1e-10)break;let l=vC(a,t,n,i,s);if(Math.abs(l)<1e-10)break;a=Math.max(0,Math.min(1,a-o/l))}return a}var fi=class{constructor(t,n,i,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(n===void 0||n.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=Fo(n,this.TimeBufferType),this.values=Fo(i,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let n=t.constructor,i;if(n.toJSON!==this.toJSON)i=n.toJSON(t);else{i={name:t.name,times:Fo(t.times,Array),values:Fo(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(i.interpolation=s),D0(t.settings)&&(i.settings={inTangents:Fo(t.settings.inTangents,Array),outTangents:Fo(t.settings.outTangents,Array)})}return i.type=t.ValueTypeName,i}InterpolantFactoryMethodDiscrete(t){return new Jf(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Zf(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Yf(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let n=new Kf(this.times,this.values,this.getValueSize(),t);return this.settings&&(n.inTangents=this.settings.inTangents,n.outTangents=this.settings.outTangents),n}setInterpolation(t){let n;switch(t){case vc:n=this.InterpolantFactoryMethodDiscrete;break;case Df:n=this.InterpolantFactoryMethodLinear;break;case xf:n=this.InterpolantFactoryMethodSmooth;break;case L0:n=this.InterpolantFactoryMethodBezier;break}if(n===void 0){let i="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(i);return Dt("KeyframeTrack:",i),this}return this.createInterpolant=n,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return vc;case this.InterpolantFactoryMethodLinear:return Df;case this.InterpolantFactoryMethodSmooth:return xf;case this.InterpolantFactoryMethodBezier:return L0}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let n=this.times;for(let i=0,s=n.length;i!==s;++i)n[i]+=t}return this}scale(t){if(t!==1){let n=this.times;for(let i=0,s=n.length;i!==s;++i)n[i]*=t;D0(this.settings)&&(zb(this.settings.inTangents,t),zb(this.settings.outTangents,t))}return this}trim(t,n){let i=this.times,s=i.length,a=0,r=s-1;for(;a!==s&&i[a]<t;)++a;for(;r!==-1&&i[r]>n;)--r;if(++r,a!==0||r!==s){a>=r&&(r=Math.max(r,1),a=r-1);let o=this.getValueSize();this.times=i.slice(a,r),this.values=this.values.slice(a*o,r*o)}return this}validate(){let t=!0,n=this.getValueSize();n-Math.floor(n)!==0&&(Ut("KeyframeTrack: Invalid value size in track.",this),t=!1);let i=this.times,s=this.values,a=i.length;a===0&&(Ut("KeyframeTrack: Track is empty.",this),t=!1);let r=null;for(let o=0;o!==a;o++){let l=i[o];if(typeof l=="number"&&isNaN(l)){Ut("KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(r!==null&&r>l){Ut("KeyframeTrack: Out of order keys.",this,o,l,r),t=!1;break}r=l}if(s!==void 0&&Jw(s))for(let o=0,l=s.length;o!==l;++o){let c=s[o];if(isNaN(c)){Ut("KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),n=this.values.slice(),i=this.getValueSize(),s=this.getInterpolation()===xf,a=t.length-1,r=1;for(let o=1;o<a;++o){let l=!1,c=t[o],f=t[o+1];if(c!==f&&(o!==1||c!==t[0]))if(s)l=!0;else{let p=o*i,u=p-i,d=p+i;for(let v=0;v!==i;++v){let M=n[p+v];if(M!==n[u+v]||M!==n[d+v]){l=!0;break}}}if(l){if(o!==r){t[r]=t[o];let p=o*i,u=r*i;for(let d=0;d!==i;++d)n[u+d]=n[p+d]}++r}}if(a>0){t[r]=t[a];for(let o=a*i,l=r*i,c=0;c!==i;++c)n[l+c]=n[o+c];++r}return r!==t.length?(this.times=t.slice(0,r),this.values=n.slice(0,r*i)):(this.times=t,this.values=n),this}clone(){let t=this.times.slice(),n=this.values.slice(),i=this.constructor,s=new i(this.name,t,n);return s.createInterpolant=this.createInterpolant,D0(this.settings)&&(s.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),s}};function zb(e,t){for(let n=0,i=e.length;n!==i;n+=2)e[n]*=t}fi.prototype.ValueTypeName="";fi.prototype.TimeBufferType=Float32Array;fi.prototype.ValueBufferType=Float32Array;fi.prototype.DefaultInterpolation=Df;var Ua=class extends fi{constructor(t,n,i){super(t,n,i)}};Ua.prototype.ValueTypeName="bool";Ua.prototype.ValueBufferType=Array;Ua.prototype.DefaultInterpolation=vc;Ua.prototype.InterpolantFactoryMethodLinear=void 0;Ua.prototype.InterpolantFactoryMethodSmooth=void 0;var Qf=class extends fi{constructor(t,n,i,s){super(t,n,i,s)}};Qf.prototype.ValueTypeName="color";var jf=class extends fi{constructor(t,n,i,s){super(t,n,i,s)}};jf.prototype.ValueTypeName="number";var $f=class extends Da{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=(i-n)/(s-n),c=t*o;for(let f=c+o;c!==f;c+=4)hs.slerpFlat(a,0,r,c-o,r,c,l);return a}},Fc=class extends fi{constructor(t,n,i,s){super(t,n,i,s)}InterpolantFactoryMethodLinear(t){return new $f(this.times,this.values,this.getValueSize(),t)}};Fc.prototype.ValueTypeName="quaternion";Fc.prototype.InterpolantFactoryMethodSmooth=void 0;var La=class extends fi{constructor(t,n,i){super(t,n,i)}};La.prototype.ValueTypeName="string";La.prototype.ValueBufferType=Array;La.prototype.DefaultInterpolation=vc;La.prototype.InterpolantFactoryMethodLinear=void 0;La.prototype.InterpolantFactoryMethodSmooth=void 0;var td=class extends fi{constructor(t,n,i,s){super(t,n,i,s)}};td.prototype.ValueTypeName="vector";var ed=class{constructor(t,n,i){let s=this,a=!1,r=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=n,this.onError=i,this._abortController=null,this.itemStart=function(f){o++,a===!1&&s.onStart!==void 0&&s.onStart(f,r,o),a=!0},this.itemEnd=function(f){r++,s.onProgress!==void 0&&s.onProgress(f,r,o),r===o&&(a=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(f){s.onError!==void 0&&s.onError(f)},this.resolveURL=function(f){return f=f.normalize("NFC"),l?l(f):f},this.setURLModifier=function(f){return l=f,this},this.addHandler=function(f,p){return c.push(f,p),this},this.removeHandler=function(f){let p=c.indexOf(f);return p!==-1&&c.splice(p,2),this},this.getHandler=function(f){for(let p=0,u=c.length;p<u;p+=2){let d=c[p],v=c[p+1];if(d.global&&(d.lastIndex=0),d.test(f))return v}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},N1=new ed,nd=class{constructor(t){this.manager=t!==void 0?t:N1,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,n){let i=this;return new Promise(function(s,a){i.load(t,s,n,a)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};nd.DEFAULT_MATERIAL_NAME="__DEFAULT";var vr=class extends fn{constructor(t,n=1){super(),this.isLight=!0,this.type="Light",this.color=new Ht(t),this.intensity=n}copy(t,n){return super.copy(t,n),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let n=super.toJSON(t);return n.object.color=this.color.getHex(),n.object.intensity=this.intensity,n}},Hc=class extends vr{constructor(t,n,i){super(t,i),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(fn.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ht(n)}copy(t,n){return super.copy(t,n),this.groundColor.copy(t.groundColor),this}toJSON(t){let n=super.toJSON(t);return n.object.groundColor=this.groundColor.getHex(),n}},U0=new Oe,Fb=new B,Hb=new B,Vc=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new It(512,512),this.mapType=Jn,this.map=null,this.mapPass=null,this.matrix=new Oe,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Jo,this._frameExtents=new It(1,1),this._viewportCount=1,this._viewports=[new ze(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(t){let n=this.camera;Fb.setFromMatrixPosition(t.matrixWorld),n.position.copy(Fb),Hb.setFromMatrixPosition(t.target.matrixWorld),n.lookAt(Hb),n.updateMatrixWorld(),this._updateMatrix(n,this.matrix,this._frustum)}_updateMatrix(t,n,i,s){U0.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),i.setFromProjectionMatrix(U0,t.coordinateSystem,t.reversedDepth);let a=this._frameExtents,r=s?s.z/a.x:1,o=s?s.w/a.y:1,l=s?s.x/a.x:0,c=s?s.y/a.y:0;t.coordinateSystem===Xo||t.reversedDepth?n.set(.5*r,0,0,.5*r+l,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):n.set(.5*r,0,0,.5*r+l,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),n.multiply(U0)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return t.intensity=this.intensity,t.bias=this.bias,t.normalBias=this.normalBias,t.radius=this.radius,t.blurSamples=this.blurSamples,t.mapSize=this.mapSize.toArray(),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},vf=new B,yf=new hs,rs=new B,Gc=class extends fn{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Oe,this.projectionMatrix=new Oe,this.projectionMatrixInverse=new Oe,this.coordinateSystem=Bi,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,n){return super.copy(t,n),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(vf,yf,rs),rs.x===1&&rs.y===1&&rs.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(vf,yf,rs.set(1,1,1)).invert()}updateWorldMatrix(t,n,i=!1){super.updateWorldMatrix(t,n,i),this.matrixWorld.decompose(vf,yf,rs),rs.x===1&&rs.y===1&&rs.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(vf,yf,rs.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},wa=new B,Vb=new It,Gb=new It,xn=class extends Gc{constructor(t=50,n=1,i=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=i,this.far=s,this.focus=10,this.aspect=n,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,n){return super.copy(t,n),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let n=.5*this.getFilmHeight()/t;this.fov=Uf*2*Math.atan(n),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(l0*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Uf*2*Math.atan(Math.tan(l0*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,n,i){wa.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(wa.x,wa.y).multiplyScalar(-t/wa.z),wa.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(wa.x,wa.y).multiplyScalar(-t/wa.z)}getViewSize(t,n){return this.getViewBounds(t,Vb,Gb),n.subVectors(Gb,Vb)}setViewOffset(t,n,i,s,a,r){this.aspect=t/n,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=n,this.view.offsetX=i,this.view.offsetY=s,this.view.width=a,this.view.height=r,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,n=t*Math.tan(l0*.5*this.fov)/this.zoom,i=2*n,s=this.aspect*i,a=-.5*s,r=this.view;if(this.view!==null&&this.view.enabled){let l=r.fullWidth,c=r.fullHeight;a+=r.offsetX*s/l,n-=r.offsetY*i/c,s*=r.width/l,i*=r.height/c}let o=this.filmOffset;o!==0&&(a+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(a,a+s,n,n-i,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let n=super.toJSON(t);return n.object.fov=this.fov,n.object.zoom=this.zoom,n.object.near=this.near,n.object.far=this.far,n.object.focus=this.focus,n.object.aspect=this.aspect,this.view!==null&&(n.object.view=Object.assign({},this.view)),n.object.filmGauge=this.filmGauge,n.object.filmOffset=this.filmOffset,n}};var B0=class extends Vc{constructor(){super(new xn(90,1,.5,500)),this.isPointLightShadow=!0}},jo=class extends vr{constructor(t,n,i=0,s=2){super(t,n),this.isPointLight=!0,this.type="PointLight",this.distance=i,this.decay=s,this.shadow=new B0}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(t,n){return super.copy(t,n),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}toJSON(t){let n=super.toJSON(t);return n.object.distance=this.distance,n.object.decay=this.decay,n.object.shadow=this.shadow.toJSON(),n}},$o=class extends Gc{constructor(t=-1,n=1,i=1,s=-1,a=.1,r=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=n,this.top=i,this.bottom=s,this.near=a,this.far=r,this.updateProjectionMatrix()}copy(t,n){return super.copy(t,n),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,n,i,s,a,r){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=n,this.view.offsetX=i,this.view.offsetY=s,this.view.width=a,this.view.height=r,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),n=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,s=(this.top+this.bottom)/2,a=i-t,r=i+t,o=s+n,l=s-n;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,f=(this.top-this.bottom)/this.view.fullHeight/this.zoom;a+=c*this.view.offsetX,r=a+c*this.view.width,o-=f*this.view.offsetY,l=o-f*this.view.height}this.projectionMatrix.makeOrthographic(a,r,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let n=super.toJSON(t);return n.object.zoom=this.zoom,n.object.left=this.left,n.object.right=this.right,n.object.top=this.top,n.object.bottom=this.bottom,n.object.near=this.near,n.object.far=this.far,this.view!==null&&(n.object.view=Object.assign({},this.view)),n}},z0=class extends Vc{constructor(){super(new $o(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},kc=class extends vr{constructor(t,n){super(t,n),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(fn.DEFAULT_UP),this.updateMatrix(),this.target=new fn,this.shadow=new z0}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){let n=super.toJSON(t);return n.object.shadow=this.shadow.toJSON(),n.object.target=this.target.uuid,n}},Xc=class extends vr{constructor(t,n){super(t,n),this.isAmbientLight=!0,this.type="AmbientLight"}};var Ho=-90,Vo=1,id=class extends fn{constructor(t,n,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new xn(Ho,Vo,t,n);s.layers=this.layers,this.add(s);let a=new xn(Ho,Vo,t,n);a.layers=this.layers,this.add(a);let r=new xn(Ho,Vo,t,n);r.layers=this.layers,this.add(r);let o=new xn(Ho,Vo,t,n);o.layers=this.layers,this.add(o);let l=new xn(Ho,Vo,t,n);l.layers=this.layers,this.add(l);let c=new xn(Ho,Vo,t,n);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,n=this.children.concat(),[i,s,a,r,o,l]=n;for(let c of n)this.remove(c);if(t===Bi)i.up.set(0,1,0),i.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),a.up.set(0,0,-1),a.lookAt(0,1,0),r.up.set(0,0,1),r.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===Xo)i.up.set(0,-1,0),i.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),a.up.set(0,0,1),a.lookAt(0,1,0),r.up.set(0,0,-1),r.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of n)this.add(c),c.updateMatrixWorld()}update(t,n){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[a,r,o,l,c,f]=this.children,p=t.getRenderTarget(),u=t.getActiveCubeFace(),d=t.getActiveMipmapLevel(),v=t.xr.enabled;t.xr.enabled=!1;let M=i.texture.generateMipmaps;i.texture.generateMipmaps=!1;let _=!1;t.isWebGLRenderer===!0?_=t.state.buffers.depth.getReversed():_=t.reversedDepthBuffer,t.setRenderTarget(i,0,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,a),t.setRenderTarget(i,1,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,r),t.setRenderTarget(i,2,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,o),t.setRenderTarget(i,3,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,l),t.setRenderTarget(i,4,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,c),i.texture.generateMipmaps=M,t.setRenderTarget(i,5,s),_&&t.autoClear===!1&&t.clearDepth(),t.render(n,f),t.setRenderTarget(p,u,d),t.xr.enabled=v,i.texture.needsPMREMUpdate=!0}},sd=class extends xn{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}},Wc=class{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(t){this._document=t,t.hidden!==void 0&&(this._pageVisibilityHandler=xC.bind(this),t.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(t){return this._timescale=t,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(t){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(t!==void 0?t:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}};function xC(){this._document.hidden===!1&&this.reset()}var f_="\\[\\]\\.:\\/",SC=new RegExp("["+f_+"]","g"),d_="[^"+f_+"]",MC="[^"+f_.replace("\\.","")+"]",bC=/((?:WC+[\/:])*)/.source.replace("WC",d_),EC=/(WCOD+)?/.source.replace("WCOD",MC),TC=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",d_),AC=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",d_),wC=new RegExp("^"+bC+EC+TC+AC+"$"),CC=["material","materials","bones","map"],F0=class{constructor(t,n,i){let s=i||Le.parseTrackName(n);this._targetGroup=t,this._bindings=t.subscribe_(n,s)}getValue(t,n){this.bind();let i=this._targetGroup.nCachedObjects_,s=this._bindings[i];s!==void 0&&s.getValue(t,n)}setValue(t,n){let i=this._bindings;for(let s=this._targetGroup.nCachedObjects_,a=i.length;s!==a;++s)i[s].setValue(t,n)}bind(){let t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].bind()}unbind(){let t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].unbind()}},Le=class e{constructor(t,n,i){this.path=n,this.parsedPath=i||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,i){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,i):new e(t,n,i)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(SC,"")}static parseTrackName(t){let n=wC.exec(t);if(n===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let i={nodeName:n[2],objectName:n[3],objectIndex:n[4],propertyName:n[5],propertyIndex:n[6]},s=i.nodeName&&i.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let a=i.nodeName.substring(s+1);CC.indexOf(a)!==-1&&(i.nodeName=i.nodeName.substring(0,s),i.objectName=a)}if(i.propertyName===null||i.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return i}static findNode(t,n){if(n===void 0||n===""||n==="."||n===-1||n===t.name||n===t.uuid)return t;if(t.skeleton){let i=t.skeleton.getBoneByName(n);if(i!==void 0)return i}if(t.children){let i=function(a){for(let r=0;r<a.length;r++){let o=a[r];if(o.name===n||o.uuid===n)return o;let l=i(o.children);if(l)return l}return null},s=i(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,n){t[n]=this.targetObject[this.propertyName]}_getValue_array(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)t[n++]=i[s]}_getValue_arrayElement(t,n){t[n]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,n){this.resolvedProperty.toArray(t,n)}_setValue_direct(t,n){this.targetObject[this.propertyName]=t[n]}_setValue_direct_setNeedsUpdate(t,n){this.targetObject[this.propertyName]=t[n],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,n){this.targetObject[this.propertyName]=t[n],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++]}_setValue_array_setNeedsUpdate(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,n){this.resolvedProperty[this.propertyIndex]=t[n]}_setValue_arrayElement_setNeedsUpdate(t,n){this.resolvedProperty[this.propertyIndex]=t[n],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,n){this.resolvedProperty[this.propertyIndex]=t[n],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,n){this.resolvedProperty.fromArray(t,n)}_setValue_fromArray_setNeedsUpdate(t,n){this.resolvedProperty.fromArray(t,n),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,n){this.resolvedProperty.fromArray(t,n),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,n){this.bind(),this.getValue(t,n)}_setValue_unbound(t,n){this.bind(),this.setValue(t,n)}bind(){let t=this.node,n=this.parsedPath,i=n.objectName,s=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Dt("PropertyBinding: No target node found for track: "+this.path+".");return}if(i){let c=n.objectIndex;switch(i){case"materials":if(!t.material){Ut("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Ut("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Ut("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let f=0;f<t.length;f++)if(t[f].name===c){c=f;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Ut("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Ut("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[i]===void 0){Ut("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[i]}if(c!==void 0){if(t[c]===void 0){Ut("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let r=t[s];if(r===void 0){let c=n.nodeName;Ut("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(a!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){Ut("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Ut("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}l=this.BindingType.ArrayElement,this.resolvedProperty=r,this.propertyIndex=a}else r.fromArray!==void 0&&r.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=r):Array.isArray(r)?(l=this.BindingType.EntireArray,this.resolvedProperty=r):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Le.Composite=F0;Le.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Le.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Le.prototype.GetterByBindingType=[Le.prototype._getValue_direct,Le.prototype._getValue_array,Le.prototype._getValue_arrayElement,Le.prototype._getValue_toArray];Le.prototype.SetterByBindingTypeAndVersioning=[[Le.prototype._setValue_direct,Le.prototype._setValue_direct_setNeedsUpdate,Le.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Le.prototype._setValue_array,Le.prototype._setValue_array_setNeedsUpdate,Le.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Le.prototype._setValue_arrayElement,Le.prototype._setValue_arrayElement_setNeedsUpdate,Le.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Le.prototype._setValue_fromArray,Le.prototype._setValue_fromArray_setNeedsUpdate,Le.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var LD=new Float32Array(1);var y_=class y_{constructor(t,n,i,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,n,i,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,n=0){for(let i=0;i<4;i++)this.elements[i]=t[i+n];return this}set(t,n,i,s){let a=this.elements;return a[0]=t,a[2]=n,a[1]=i,a[3]=s,this}};y_.prototype.isMatrix2=!0;var H0=y_;var qc=class extends Vf{constructor(t=10,n=10,i=4473924,s=8947848){i=new Ht(i),s=new Ht(s);let a=n/2,r=t/n,o=t/2,l=[],c=[];for(let u=0,d=0,v=-o;u<=n;u++,v+=r){l.push(-o,0,v,o,0,v),l.push(v,0,-o,v,0,o);let M=u===a?i:s;M.toArray(c,d),d+=3,M.toArray(c,d),d+=3,M.toArray(c,d),d+=3,M.toArray(c,d),d+=3}let f=new bn;f.setAttribute("position",new Se(l,3)),f.setAttribute("color",new Se(c,3));let p=new Lc({vertexColors:!0,toneMapped:!1});super(f,p),this.type="GridHelper"}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}};function p_(e,t,n,i){let s=RC(i);switch(n){case r_:return e*t;case l_:return e*t/s.components*s.byteLength;case fd:return e*t/s.components*s.byteLength;case za:return e*t*2/s.components*s.byteLength;case dd:return e*t*2/s.components*s.byteLength;case o_:return e*t*3/s.components*s.byteLength;case Ti:return e*t*4/s.components*s.byteLength;case pd:return e*t*4/s.components*s.byteLength;case Kc:case Qc:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case jc:case $c:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case gd:case vd:return Math.max(e,16)*Math.max(t,8)/4;case md:case _d:return Math.max(e,8)*Math.max(t,8)/2;case yd:case xd:case Md:case bd:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case Sd:case tu:case Ed:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case Td:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case Ad:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case wd:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case Cd:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case Rd:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case Nd:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case Dd:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case Ud:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case Ld:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case Od:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case Id:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case Pd:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case Bd:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case zd:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case Fd:case Hd:case Vd:return Math.ceil(e/4)*Math.ceil(t/4)*16;case Gd:case kd:return Math.ceil(e/4)*Math.ceil(t/4)*8;case eu:case Xd:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${n} format.`)}function RC(e){switch(e){case Jn:case n_:return{byteLength:1,components:1};case nl:case i_:case Vi:return{byteLength:2,components:1};case ud:case hd:return{byteLength:2,components:4};case Fi:case cd:case Hi:return{byteLength:4,components:1};case s_:case a_:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}}));typeof window<"u"&&(window.__THREE__?Dt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="186");function j1(){let e=null,t=!1,n=null,i=null;function s(a,r){i=e.requestAnimationFrame(s),n(a,r)}return{start:function(){t!==!0&&n!==null&&e!==null&&(i=e.requestAnimationFrame(s),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(i),t=!1},setAnimationLoop:function(a){n=a},setContext:function(a){e=a}}}function DC(e){let t=new WeakMap;function n(o,l){let c=o.array,f=o.usage,p=c.byteLength,u=e.createBuffer();e.bindBuffer(l,u),e.bufferData(l,c,f),o.onUploadCallback();let d;if(c instanceof Float32Array)d=e.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)d=e.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?d=e.HALF_FLOAT:d=e.UNSIGNED_SHORT;else if(c instanceof Int16Array)d=e.SHORT;else if(c instanceof Uint32Array)d=e.UNSIGNED_INT;else if(c instanceof Int32Array)d=e.INT;else if(c instanceof Int8Array)d=e.BYTE;else if(c instanceof Uint8Array)d=e.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)d=e.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:d,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:p}}function i(o,l,c){let f=l.array,p=l.updateRanges;if(e.bindBuffer(c,o),p.length===0)e.bufferSubData(c,0,f);else{p.sort((d,v)=>d.start-v.start);let u=0;for(let d=1;d<p.length;d++){let v=p[u],M=p[d];M.start<=v.start+v.count+1?v.count=Math.max(v.count,M.start+M.count-v.start):(++u,p[u]=M)}p.length=u+1;for(let d=0,v=p.length;d<v;d++){let M=p[d];e.bufferSubData(c,M.start*f.BYTES_PER_ELEMENT,f,M.start,M.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function a(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=t.get(o);l&&(e.deleteBuffer(l.buffer),t.delete(o))}function r(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let f=t.get(o);(!f||f.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let c=t.get(o);if(c===void 0)t.set(o,n(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(c.buffer,o,l),c.version=o.version}}return{get:s,remove:a,update:r}}var UC=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,LC=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,OC=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,IC=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,PC=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,BC=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,zC=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,FC=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,HC=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,VC=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,GC=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,kC=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,XC=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,WC=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,qC=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,YC=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,ZC=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,JC=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,KC=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,QC=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,jC=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,$C=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,tR=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,eR=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,nR=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,iR=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,sR=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,aR=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,rR=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,oR=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,lR="gl_FragColor = linearToOutputTexel( gl_FragColor );",cR=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,uR=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,hR=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,fR=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,dR=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,pR=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,mR=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,gR=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,_R=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,vR=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,yR=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,xR=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,SR=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,MR=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,bR=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,ER=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,TR=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,AR=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,wR=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,CR=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,RR=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,NR=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,DR=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,UR=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,LR=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,OR=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,IR=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,PR=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,BR=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,zR=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,FR=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,HR=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,VR=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,GR=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,kR=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,XR=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,WR=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,qR=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,YR=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,ZR=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,JR=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,KR=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,QR=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,jR=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,$R=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,t3=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,e3=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,n3=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,i3=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,s3=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,a3=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,r3=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,o3=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,l3=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,c3=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,u3=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,h3=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,f3=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,d3=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,p3=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,m3=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,g3=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,_3=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,v3=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,y3=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,x3=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,S3=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,M3=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,b3=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,E3=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,T3=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,A3=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,w3=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,C3=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,R3=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,N3=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,D3=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,U3=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,L3=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,O3=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,I3=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,P3=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,B3=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,z3=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,F3=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,H3=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,V3=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,G3=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,k3=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,X3=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,W3=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,q3=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Y3=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Z3=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,J3=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,K3=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Q3=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,j3=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,$3=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,t2=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,e2=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,n2=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,i2=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,s2=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,a2=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,r2=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,o2=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,l2=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,c2=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,u2=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,h2=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Xt={alphahash_fragment:UC,alphahash_pars_fragment:LC,alphamap_fragment:OC,alphamap_pars_fragment:IC,alphatest_fragment:PC,alphatest_pars_fragment:BC,aomap_fragment:zC,aomap_pars_fragment:FC,batching_pars_vertex:HC,batching_vertex:VC,begin_vertex:GC,beginnormal_vertex:kC,bsdfs:XC,iridescence_fragment:WC,bumpmap_pars_fragment:qC,clipping_planes_fragment:YC,clipping_planes_pars_fragment:ZC,clipping_planes_pars_vertex:JC,clipping_planes_vertex:KC,color_fragment:QC,color_pars_fragment:jC,color_pars_vertex:$C,color_vertex:tR,common:eR,cube_uv_reflection_fragment:nR,defaultnormal_vertex:iR,displacementmap_pars_vertex:sR,displacementmap_vertex:aR,emissivemap_fragment:rR,emissivemap_pars_fragment:oR,colorspace_fragment:lR,colorspace_pars_fragment:cR,envmap_fragment:uR,envmap_common_pars_fragment:hR,envmap_pars_fragment:fR,envmap_pars_vertex:dR,envmap_physical_pars_fragment:ER,envmap_vertex:pR,fog_vertex:mR,fog_pars_vertex:gR,fog_fragment:_R,fog_pars_fragment:vR,gradientmap_pars_fragment:yR,lightmap_pars_fragment:xR,lights_lambert_fragment:SR,lights_lambert_pars_fragment:MR,lights_pars_begin:bR,lights_toon_fragment:TR,lights_toon_pars_fragment:AR,lights_phong_fragment:wR,lights_phong_pars_fragment:CR,lights_physical_fragment:RR,lights_physical_pars_fragment:NR,lights_fragment_begin:DR,lights_fragment_maps:UR,lights_fragment_end:LR,lightprobes_pars_fragment:OR,logdepthbuf_fragment:IR,logdepthbuf_pars_fragment:PR,logdepthbuf_pars_vertex:BR,logdepthbuf_vertex:zR,map_fragment:FR,map_pars_fragment:HR,map_particle_fragment:VR,map_particle_pars_fragment:GR,metalnessmap_fragment:kR,metalnessmap_pars_fragment:XR,morphinstance_vertex:WR,morphcolor_vertex:qR,morphnormal_vertex:YR,morphtarget_pars_vertex:ZR,morphtarget_vertex:JR,normal_fragment_begin:KR,normal_fragment_maps:QR,normal_pars_fragment:jR,normal_pars_vertex:$R,normal_vertex:t3,normalmap_pars_fragment:e3,clearcoat_normal_fragment_begin:n3,clearcoat_normal_fragment_maps:i3,clearcoat_pars_fragment:s3,iridescence_pars_fragment:a3,opaque_fragment:r3,packing:o3,premultiplied_alpha_fragment:l3,project_vertex:c3,dithering_fragment:u3,dithering_pars_fragment:h3,roughnessmap_fragment:f3,roughnessmap_pars_fragment:d3,shadowmap_pars_fragment:p3,shadowmap_pars_vertex:m3,shadowmap_vertex:g3,shadowmask_pars_fragment:_3,skinbase_vertex:v3,skinning_pars_vertex:y3,skinning_vertex:x3,skinnormal_vertex:S3,specularmap_fragment:M3,specularmap_pars_fragment:b3,tonemapping_fragment:E3,tonemapping_pars_fragment:T3,transmission_fragment:A3,transmission_pars_fragment:w3,uv_pars_fragment:C3,uv_pars_vertex:R3,uv_vertex:N3,worldpos_vertex:D3,background_vert:U3,background_frag:L3,backgroundCube_vert:O3,backgroundCube_frag:I3,cube_vert:P3,cube_frag:B3,depth_vert:z3,depth_frag:F3,distance_vert:H3,distance_frag:V3,equirect_vert:G3,equirect_frag:k3,linedashed_vert:X3,linedashed_frag:W3,meshbasic_vert:q3,meshbasic_frag:Y3,meshlambert_vert:Z3,meshlambert_frag:J3,meshmatcap_vert:K3,meshmatcap_frag:Q3,meshnormal_vert:j3,meshnormal_frag:$3,meshphong_vert:t2,meshphong_frag:e2,meshphysical_vert:n2,meshphysical_frag:i2,meshtoon_vert:s2,meshtoon_frag:a2,points_vert:r2,points_frag:o2,shadow_vert:l2,shadow_frag:c2,sprite_vert:u2,sprite_frag:h2},dt={common:{diffuse:{value:new Ht(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Bt},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Bt}},envmap:{envMap:{value:null},envMapRotation:{value:new Bt},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Bt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Bt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Bt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Bt},normalScale:{value:new It(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Bt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Bt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Bt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Bt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ht(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new B},probesMax:{value:new B},probesResolution:{value:new B}},points:{diffuse:{value:new Ht(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0},uvTransform:{value:new Bt}},sprite:{diffuse:{value:new Ht(16777215)},opacity:{value:1},center:{value:new It(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Bt},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0}}},gs={basic:{uniforms:Nn([dt.common,dt.specularmap,dt.envmap,dt.aomap,dt.lightmap,dt.fog]),vertexShader:Xt.meshbasic_vert,fragmentShader:Xt.meshbasic_frag},lambert:{uniforms:Nn([dt.common,dt.specularmap,dt.envmap,dt.aomap,dt.lightmap,dt.emissivemap,dt.bumpmap,dt.normalmap,dt.displacementmap,dt.fog,dt.lights,{emissive:{value:new Ht(0)},envMapIntensity:{value:1}}]),vertexShader:Xt.meshlambert_vert,fragmentShader:Xt.meshlambert_frag},phong:{uniforms:Nn([dt.common,dt.specularmap,dt.envmap,dt.aomap,dt.lightmap,dt.emissivemap,dt.bumpmap,dt.normalmap,dt.displacementmap,dt.fog,dt.lights,{emissive:{value:new Ht(0)},specular:{value:new Ht(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Xt.meshphong_vert,fragmentShader:Xt.meshphong_frag},standard:{uniforms:Nn([dt.common,dt.envmap,dt.aomap,dt.lightmap,dt.emissivemap,dt.bumpmap,dt.normalmap,dt.displacementmap,dt.roughnessmap,dt.metalnessmap,dt.fog,dt.lights,{emissive:{value:new Ht(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Xt.meshphysical_vert,fragmentShader:Xt.meshphysical_frag},toon:{uniforms:Nn([dt.common,dt.aomap,dt.lightmap,dt.emissivemap,dt.bumpmap,dt.normalmap,dt.displacementmap,dt.gradientmap,dt.fog,dt.lights,{emissive:{value:new Ht(0)}}]),vertexShader:Xt.meshtoon_vert,fragmentShader:Xt.meshtoon_frag},matcap:{uniforms:Nn([dt.common,dt.bumpmap,dt.normalmap,dt.displacementmap,dt.fog,{matcap:{value:null}}]),vertexShader:Xt.meshmatcap_vert,fragmentShader:Xt.meshmatcap_frag},points:{uniforms:Nn([dt.points,dt.fog]),vertexShader:Xt.points_vert,fragmentShader:Xt.points_frag},dashed:{uniforms:Nn([dt.common,dt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Xt.linedashed_vert,fragmentShader:Xt.linedashed_frag},depth:{uniforms:Nn([dt.common,dt.displacementmap]),vertexShader:Xt.depth_vert,fragmentShader:Xt.depth_frag},normal:{uniforms:Nn([dt.common,dt.bumpmap,dt.normalmap,dt.displacementmap,{opacity:{value:1}}]),vertexShader:Xt.meshnormal_vert,fragmentShader:Xt.meshnormal_frag},sprite:{uniforms:Nn([dt.sprite,dt.fog]),vertexShader:Xt.sprite_vert,fragmentShader:Xt.sprite_frag},background:{uniforms:{uvTransform:{value:new Bt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Xt.background_vert,fragmentShader:Xt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Bt}},vertexShader:Xt.backgroundCube_vert,fragmentShader:Xt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Xt.cube_vert,fragmentShader:Xt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Xt.equirect_vert,fragmentShader:Xt.equirect_frag},distance:{uniforms:Nn([dt.common,dt.displacementmap,{referencePosition:{value:new B},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Xt.distance_vert,fragmentShader:Xt.distance_frag},shadow:{uniforms:Nn([dt.lights,dt.fog,{color:{value:new Ht(0)},opacity:{value:1}}]),vertexShader:Xt.shadow_vert,fragmentShader:Xt.shadow_frag}};gs.physical={uniforms:Nn([gs.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Bt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Bt},clearcoatNormalScale:{value:new It(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Bt},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Bt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Bt},sheen:{value:0},sheenColor:{value:new Ht(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Bt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Bt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Bt},transmissionSamplerSize:{value:new It},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Bt},attenuationDistance:{value:0},attenuationColor:{value:new Ht(0)},specularColor:{value:new Ht(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Bt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Bt},anisotropyVector:{value:new It},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Bt}}]),vertexShader:Xt.meshphysical_vert,fragmentShader:Xt.meshphysical_frag};var Zd={r:0,b:0,g:0},f2=new Oe,$1=new Bt;$1.set(-1,0,0,0,1,0,0,0,1);function d2(e,t,n,i,s,a){let r=new Ht(0),o=s===!0?0:1,l,c,f=null,p=0,u=null;function d(m){let S=m.isScene===!0?m.background:null;if(S&&S.isTexture){let y=m.backgroundBlurriness>0;S=t.get(S,y)}return S}function v(m){let S=!1,y=d(m);y===null?_(r,o):y&&y.isColor&&(_(y,1),S=!0);let E=e.xr.getEnvironmentBlendMode();E==="additive"?n.buffers.color.setClear(0,0,0,1,a):E==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||S)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function M(m,S){let y=d(S);y&&(y.isCubeTexture||y.mapping===Zc)?(c===void 0&&(c=new Vt(new en(1,1,1),new hi({name:"BackgroundCubeMaterial",uniforms:Sr(gs.backgroundCube.uniforms),vertexShader:gs.backgroundCube.vertexShader,fragmentShader:gs.backgroundCube.fragmentShader,side:Fn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(E,A,C){this.matrixWorld.copyPosition(C.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(c)),c.material.uniforms.envMap.value=y,c.material.uniforms.backgroundBlurriness.value=S.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(f2.makeRotationFromEuler(S.backgroundRotation)).transpose(),y.isCubeTexture&&y.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply($1),c.material.toneMapped=te.getTransfer(y.colorSpace)!==de,(f!==y||p!==y.version||u!==e.toneMapping)&&(c.material.needsUpdate=!0,f=y,p=y.version,u=e.toneMapping),c.layers.enableAll(),m.unshift(c,c.geometry,c.material,0,0,null)):y&&y.isTexture&&(l===void 0&&(l=new Vt(new zc(2,2),new hi({name:"BackgroundMaterial",uniforms:Sr(gs.background.uniforms),vertexShader:gs.background.vertexShader,fragmentShader:gs.background.fragmentShader,side:Oa,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=y,l.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,l.material.toneMapped=te.getTransfer(y.colorSpace)!==de,y.matrixAutoUpdate===!0&&y.updateMatrix(),l.material.uniforms.uvTransform.value.copy(y.matrix),(f!==y||p!==y.version||u!==e.toneMapping)&&(l.material.needsUpdate=!0,f=y,p=y.version,u=e.toneMapping),l.layers.enableAll(),m.unshift(l,l.geometry,l.material,0,0,null))}function _(m,S){m.getRGB(Zd,h_(e)),n.buffers.color.setClear(Zd.r,Zd.g,Zd.b,S,a)}function h(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return r},setClearColor:function(m,S=1){r.set(m),o=S,_(r,o)},getClearAlpha:function(){return o},setClearAlpha:function(m){o=m,_(r,o)},render:v,addToRenderList:M,dispose:h}}function p2(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},s=u(null),a=s,r=!1;function o(U,I,F,D,G){let Y=!1,Z=p(U,D,F,I);a!==Z&&(a=Z,c(a.object)),Y=d(U,D,F,G),Y&&v(U,D,F,G),G!==null&&t.update(G,e.ELEMENT_ARRAY_BUFFER),(Y||r)&&(r=!1,y(U,I,F,D),G!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(G).buffer))}function l(){return e.createVertexArray()}function c(U){return e.bindVertexArray(U)}function f(U){return e.deleteVertexArray(U)}function p(U,I,F,D){let G=D.wireframe===!0,Y=i[I.id];Y===void 0&&(Y={},i[I.id]=Y);let Z=U.isInstancedMesh===!0?U.id:0,it=Y[Z];it===void 0&&(it={},Y[Z]=it);let W=it[F.id];W===void 0&&(W={},it[F.id]=W);let $=W[G];return $===void 0&&($=u(l()),W[G]=$),$}function u(U){let I=[],F=[],D=[];for(let G=0;G<n;G++)I[G]=0,F[G]=0,D[G]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:I,enabledAttributes:F,attributeDivisors:D,object:U,attributes:{},index:null}}function d(U,I,F,D){let G=a.attributes,Y=I.attributes,Z=0,it=F.getAttributes();for(let W in it)if(it[W].location>=0){let et=G[W],At=Y[W];if(At===void 0&&(W==="instanceMatrix"&&U.instanceMatrix&&(At=U.instanceMatrix),W==="instanceColor"&&U.instanceColor&&(At=U.instanceColor)),et===void 0||et.attribute!==At||At&&et.data!==At.data)return!0;Z++}return a.attributesNum!==Z||a.index!==D}function v(U,I,F,D){let G={},Y=I.attributes,Z=0,it=F.getAttributes();for(let W in it)if(it[W].location>=0){let et=Y[W];et===void 0&&(W==="instanceMatrix"&&U.instanceMatrix&&(et=U.instanceMatrix),W==="instanceColor"&&U.instanceColor&&(et=U.instanceColor));let At={};At.attribute=et,et&&et.data&&(At.data=et.data),G[W]=At,Z++}a.attributes=G,a.attributesNum=Z,a.index=D}function M(){let U=a.newAttributes;for(let I=0,F=U.length;I<F;I++)U[I]=0}function _(U){h(U,0)}function h(U,I){let F=a.newAttributes,D=a.enabledAttributes,G=a.attributeDivisors;F[U]=1,D[U]===0&&(e.enableVertexAttribArray(U),D[U]=1),G[U]!==I&&(e.vertexAttribDivisor(U,I),G[U]=I)}function m(){let U=a.newAttributes,I=a.enabledAttributes;for(let F=0,D=I.length;F<D;F++)I[F]!==U[F]&&(e.disableVertexAttribArray(F),I[F]=0)}function S(U,I,F,D,G,Y,Z){Z===!0?e.vertexAttribIPointer(U,I,F,G,Y):e.vertexAttribPointer(U,I,F,D,G,Y)}function y(U,I,F,D){M();let G=D.attributes,Y=F.getAttributes(),Z=I.defaultAttributeValues;for(let it in Y){let W=Y[it];if(W.location>=0){let $=G[it];if($===void 0&&(it==="instanceMatrix"&&U.instanceMatrix&&($=U.instanceMatrix),it==="instanceColor"&&U.instanceColor&&($=U.instanceColor)),$!==void 0){let et=$.normalized,At=$.itemSize,St=t.get($);if(St===void 0)continue;let ae=St.buffer,Wt=St.type,ne=St.bytesPerElement,q=Wt===e.INT||Wt===e.UNSIGNED_INT||$.gpuType===cd;if($.isInterleavedBufferAttribute){let tt=$.data,vt=tt.stride,Ot=$.offset;if(tt.isInstancedInterleavedBuffer){for(let _t=0;_t<W.locationSize;_t++)h(W.location+_t,tt.meshPerAttribute);U.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=tt.meshPerAttribute*tt.count)}else for(let _t=0;_t<W.locationSize;_t++)_(W.location+_t);e.bindBuffer(e.ARRAY_BUFFER,ae);for(let _t=0;_t<W.locationSize;_t++)S(W.location+_t,At/W.locationSize,Wt,et,vt*ne,(Ot+At/W.locationSize*_t)*ne,q)}else{if($.isInstancedBufferAttribute){for(let tt=0;tt<W.locationSize;tt++)h(W.location+tt,$.meshPerAttribute);U.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=$.meshPerAttribute*$.count)}else for(let tt=0;tt<W.locationSize;tt++)_(W.location+tt);e.bindBuffer(e.ARRAY_BUFFER,ae);for(let tt=0;tt<W.locationSize;tt++)S(W.location+tt,At/W.locationSize,Wt,et,At*ne,At/W.locationSize*tt*ne,q)}}else if(Z!==void 0){let et=Z[it];if(et!==void 0)switch(et.length){case 2:e.vertexAttrib2fv(W.location,et);break;case 3:e.vertexAttrib3fv(W.location,et);break;case 4:e.vertexAttrib4fv(W.location,et);break;default:e.vertexAttrib1fv(W.location,et)}}}}m()}function E(){b();for(let U in i){let I=i[U];for(let F in I){let D=I[F];for(let G in D){let Y=D[G];for(let Z in Y)f(Y[Z].object),delete Y[Z];delete D[G]}}delete i[U]}}function A(U){if(i[U.id]===void 0)return;let I=i[U.id];for(let F in I){let D=I[F];for(let G in D){let Y=D[G];for(let Z in Y)f(Y[Z].object),delete Y[Z];delete D[G]}}delete i[U.id]}function C(U){for(let I in i){let F=i[I];for(let D in F){let G=F[D];if(G[U.id]===void 0)continue;let Y=G[U.id];for(let Z in Y)f(Y[Z].object),delete Y[Z];delete G[U.id]}}}function g(U){for(let I in i){let F=i[I],D=U.isInstancedMesh===!0?U.id:0,G=F[D];if(G!==void 0){for(let Y in G){let Z=G[Y];for(let it in Z)f(Z[it].object),delete Z[it];delete G[Y]}delete F[D],Object.keys(F).length===0&&delete i[I]}}}function b(){R(),r=!0,a!==s&&(a=s,c(a.object))}function R(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:b,resetDefaultState:R,dispose:E,releaseStatesOfGeometry:A,releaseStatesOfObject:g,releaseStatesOfProgram:C,initAttributes:M,enableAttribute:_,disableUnusedAttributes:m}}function m2(e,t,n){let i;function s(l){i=l}function a(l,c){e.drawArrays(i,l,c),n.update(c,i,1)}function r(l,c,f){f!==0&&(e.drawArraysInstanced(i,l,c,f),n.update(c,i,f))}function o(l,c,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,l,0,c,0,f);let u=0;for(let d=0;d<f;d++)u+=c[d];n.update(u,i,1)}this.setMode=s,this.render=a,this.renderInstances=r,this.renderMultiDraw=o}function g2(e,t,n,i){let s;function a(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let C=t.get("EXT_texture_filter_anisotropic");s=e.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function r(C){return!(C!==Ti&&i.convert(C)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(C){let g=C===Vi&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(C!==Jn&&C!==Hi&&!g&&i.convert(C)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))}function l(C){if(C==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=n.precision!==void 0?n.precision:"highp",f=l(c);f!==c&&(Dt("WebGLRenderer:",c,"not supported, using",f,"instead."),c=f);let p=n.logarithmicDepthBuffer===!0,u=n.reversedDepthBuffer===!0&&t.has("EXT_clip_control");n.reversedDepthBuffer===!0&&u===!1&&Dt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let d=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),v=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),M=e.getParameter(e.MAX_TEXTURE_SIZE),_=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),h=e.getParameter(e.MAX_VERTEX_ATTRIBS),m=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),S=e.getParameter(e.MAX_VARYING_VECTORS),y=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),E=e.getParameter(e.MAX_SAMPLES),A=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:l,textureFormatReadable:r,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:p,reversedDepthBuffer:u,maxTextures:d,maxVertexTextures:v,maxTextureSize:M,maxCubemapSize:_,maxAttributes:h,maxVertexUniforms:m,maxVaryings:S,maxFragmentUniforms:y,maxSamples:E,samples:A}}function _2(e){let t=this,n=null,i=0,s=!1,a=!1,r=new Pi,o=new Bt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(p,u){let d=p.length!==0||u||i!==0||s;return s=u,i=p.length,d},this.beginShadows=function(){a=!0,f(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(p,u){n=f(p,u,0)},this.setState=function(p,u,d){let v=p.clippingPlanes,M=p.clipIntersection,_=p.clipShadows,h=e.get(p);if(!s||v===null||v.length===0||a&&!_)a?f(null):c();else{let m=a?0:i,S=m*4,y=h.clippingState||null;l.value=y,y=f(v,u,S,d);for(let E=0;E!==S;++E)y[E]=n[E];h.clippingState=y,this.numIntersection=M?this.numPlanes:0,this.numPlanes+=m}};function c(){l.value!==n&&(l.value=n,l.needsUpdate=i>0),t.numPlanes=i,t.numIntersection=0}function f(p,u,d,v){let M=p!==null?p.length:0,_=null;if(M!==0){if(_=l.value,v!==!0||_===null){let h=d+M*4,m=u.matrixWorldInverse;o.getNormalMatrix(m),(_===null||_.length<h)&&(_=new Float32Array(h));for(let S=0,y=d;S!==M;++S,y+=4)r.copy(p[S]).applyMatrix4(m,o),r.normal.toArray(_,y),_[y+3]=r.constant}l.value=_,l.needsUpdate=!0}return t.numPlanes=M,t.numIntersection=0,_}}var al=4,v2=6,y2=20,x2=256,nu=new $o,D1=new Ht,x_=null,S_=0,M_=0,b_=!1,S2=new B,Mr=new B,Kd=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,n=0,i=.1,s=100,a={}){let{size:r=256,position:o=S2}=a;x_=this._renderer.getRenderTarget(),S_=this._renderer.getActiveCubeFace(),M_=this._renderer.getActiveMipmapLevel(),b_=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(r);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,i,s,l,o),n>0&&this._blur(l,0,0,n),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,n=null){return this._fromTexture(t,n)}fromCubemap(t,n=null){return this._fromTexture(t,n)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=O1(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=L1(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(x_,S_,M_),this._renderer.xr.enabled=b_,t.scissorTest=!1,sl(t,0,0,t.width,t.height)}_fromTexture(t,n){t.mapping===Ia||t.mapping===xr?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),x_=this._renderer.getRenderTarget(),S_=this._renderer.getActiveCubeFace(),M_=this._renderer.getActiveMipmapLevel(),b_=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let i=n||this._allocateTargets();return this._textureToCubeUV(t,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),n=4*this._cubeSize,i={magFilter:Mn,minFilter:Mn,generateMipmaps:!1,type:Vi,format:Ti,colorSpace:yc,depthBuffer:!1},s=U1(t,n,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==n){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=U1(t,n,i);let{_lodMax:a}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=M2(a)),this._blurMaterial=E2(a,t,n),this._ggxMaterial=b2(a,t,n)}return s}_compileMaterial(t){let n=new Vt(new bn,t);this._renderer.compile(n,nu)}_sceneToCubeUV(t,n,i,s,a){let l=new xn(90,1,n,i),c=[1,-1,1,1,1,1],f=[1,1,1,-1,-1,-1],p=this._renderer,u=p.autoClear,d=p.toneMapping;p.getClearColor(D1),p.toneMapping=zi,p.autoClear=!1,p.state.buffers.depth.getReversed()&&(p.setRenderTarget(s),p.clearDepth(),p.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Vt(new en,new Uc({name:"PMREM.Background",side:Fn,depthWrite:!1,depthTest:!1})));let M=this._backgroundBox,_=M.material,h=!1,m=t.background;m?m.isColor&&(_.color.copy(m),t.background=null,h=!0):(_.color.copy(D1),h=!0);for(let S=0;S<6;S++){let y=S%3;y===0?(l.up.set(0,c[S],0),l.position.set(a.x,a.y,a.z),l.lookAt(a.x+f[S],a.y,a.z)):y===1?(l.up.set(0,0,c[S]),l.position.set(a.x,a.y,a.z),l.lookAt(a.x,a.y+f[S],a.z)):(l.up.set(0,c[S],0),l.position.set(a.x,a.y,a.z),l.lookAt(a.x,a.y,a.z+f[S]));let E=this._cubeSize;sl(s,y*E,S>2?E:0,E,E),p.setRenderTarget(s),h&&p.render(M,l),p.render(t,l)}p.toneMapping=d,p.autoClear=u,t.background=m}_textureToCubeUV(t,n){let i=this._renderer,s=t.mapping===Ia||t.mapping===xr;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=O1()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=L1());let a=s?this._cubemapMaterial:this._equirectMaterial,r=this._lodMeshes[0];r.material=a;let o=a.uniforms;o.envMap.value=t;let l=this._cubeSize;sl(n,0,0,3*l,2*l),i.setRenderTarget(n),i.render(r,nu)}_applyPMREM(t){let n=this._renderer,i=n.autoClear;n.autoClear=!1;let s=this._lodMeshes.length;for(let a=1;a<s;a++)this._applyGGXFilter(t,a-1,a);n.autoClear=i}_applyGGXFilter(t,n,i){let s=this._renderer,a=this._pingPongRenderTarget,r=this._ggxMaterial,o=this._lodMeshes[i];o.material=r;let l=r.uniforms,c=i/(this._lodMeshes.length-1),f=n/(this._lodMeshes.length-1),p=Math.sqrt(c*c-f*f),u=c*1.25,d=p*u,{_lodMax:v}=this,M=this._sizeLods[i],_=3*M*(i>v-al?i-v+al:0),h=4*(this._cubeSize-M);l.envMap.value=t.texture,l.roughness.value=d,l.mipInt.value=v-n,sl(a,_,h,3*M,2*M),s.setRenderTarget(a),s.render(o,nu),l.envMap.value=a.texture,l.roughness.value=0,l.mipInt.value=v-i,sl(t,_,h,3*M,2*M),s.setRenderTarget(t),s.render(o,nu)}_blur(t,n,i,s){let a=this._pingPongRenderTarget,r=Math.min(s,Math.PI)/Math.SQRT2;this._blurPass(t,a,n,i,r),this._blurPass(a,t,i,i,r)}_blurPass(t,n,i,s,a){let r=this._renderer,o=this._blurMaterial,l=this._lodMeshes[s];l.material=o;let c=o.uniforms;c.envMap.value=t.texture,c.sigma.value=a,c.mipInt.value=this._lodMax-i;let f=this._sizeLods[s],p=3*f*(s>this._lodMax-al?s-this._lodMax+al:0),u=4*(this._cubeSize-f);sl(n,p,u,3*f,2*f),r.setRenderTarget(n),r.render(l,nu)}};function M2(e){let t=[],n=[],i=e,s=e-al+1+v2;for(let a=0;a<s;a++){let r=Math.pow(2,i);t.push(r);let o=1/(r-2),l=-o,c=1+o,f=[l,l,c,l,c,c,l,l,c,c,l,c],p=6,u=6,d=3,v=new Float32Array(d*u*p),M=new Float32Array(d*u*p);for(let h=0;h<p;h++){let m=h%3*2/3-1,S=h>2?0:-1,y=[m,S,0,m+2/3,S,0,m+2/3,S+1,0,m,S,0,m+2/3,S+1,0,m,S+1,0];v.set(y,d*u*h);for(let E=0;E<u;E++){let A=f[E*2]*2-1,C=f[E*2+1]*2-1;h===0?Mr.set(1,C,A):h===1?Mr.set(-A,1,-C):h===2?Mr.set(-A,C,1):h===3?Mr.set(-1,C,-A):h===4?Mr.set(-A,-1,C):Mr.set(A,C,-1),Mr.toArray(M,(h*u+E)*d)}}let _=new bn;_.setAttribute("position",new ui(v,d)),_.setAttribute("outputDirection",new ui(M,d)),n.push(new Vt(_,null)),i>al&&i--}return{lodMeshes:n,sizeLods:t}}function U1(e,t,n){let i=new Yn(e,t,n);return i.texture.mapping=Zc,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function sl(e,t,n,i,s){e.viewport.set(t,n,i,s),e.scissor.set(t,n,i,s)}function b2(e,t,n){return new hi({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:x2,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:$d(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:ps,depthTest:!1,depthWrite:!1})}function E2(e,t,n){return new hi({name:"SphericalGaussianBlur",defines:{SAMPLES:y2,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:$d(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:ps,depthTest:!1,depthWrite:!1})}function L1(){return new hi({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:$d(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:ps,depthTest:!1,depthWrite:!1})}function O1(){return new hi({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:$d(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:ps,depthTest:!1,depthWrite:!1})}function $d(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}var Qd=class extends Yn{constructor(t=1,n={}){super(t,t,n),this.isWebGLCubeRenderTarget=!0;let i={width:t,height:t,depth:1},s=[i,i,i,i,i,i];this.texture=new Oc(s),this._setTextureOptions(n),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,n){this.texture.type=n.type,this.texture.colorSpace=n.colorSpace,this.texture.generateMipmaps=n.generateMipmaps,this.texture.minFilter=n.minFilter,this.texture.magFilter=n.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new en(5,5,5),a=new hi({name:"CubemapFromEquirect",uniforms:Sr(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:Fn,blending:ps});a.uniforms.tEquirect.value=n;let r=new Vt(s,a),o=n.minFilter;return n.minFilter===Pa&&(n.minFilter=Mn),new id(1,10,this).update(t,r),n.minFilter=o,r.geometry.dispose(),r.material.dispose(),this}clear(t,n=!0,i=!0,s=!0){let a=t.getRenderTarget();for(let r=0;r<6;r++)t.setRenderTarget(this,r),t.clear(n,i,s);t.setRenderTarget(a)}};function T2(e){let t=new WeakMap,n=new WeakMap,i=null;function s(u,d=!1){return u==null?null:d?r(u):a(u)}function a(u){if(u&&u.isTexture){let d=u.mapping;if(d===rd||d===od)if(t.has(u)){let v=t.get(u).texture;return o(v,u.mapping)}else{let v=u.image;if(v&&v.height>0){let M=new Qd(v.height);return M.fromEquirectangularTexture(e,u),t.set(u,M),u.addEventListener("dispose",c),o(M.texture,u.mapping)}else return null}}return u}function r(u){if(u&&u.isTexture){let d=u.mapping,v=d===rd||d===od,M=d===Ia||d===xr;if(v||M){let _=n.get(u),h=_!==void 0?_.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==h)return i===null&&(i=new Kd(e)),_=v?i.fromEquirectangular(u,_):i.fromCubemap(u,_),_.texture.pmremVersion=u.pmremVersion,n.set(u,_),_.texture;if(_!==void 0)return _.texture;{let m=u.image;return v&&m&&m.height>0||M&&m&&l(m)?(i===null&&(i=new Kd(e)),_=v?i.fromEquirectangular(u):i.fromCubemap(u),_.texture.pmremVersion=u.pmremVersion,n.set(u,_),u.addEventListener("dispose",f),_.texture):null}}}return u}function o(u,d){return d===rd?u.mapping=Ia:d===od&&(u.mapping=xr),u}function l(u){let d=0,v=6;for(let M=0;M<v;M++)u[M]!==void 0&&d++;return d===v}function c(u){let d=u.target;d.removeEventListener("dispose",c);let v=t.get(d);v!==void 0&&(t.delete(d),v.dispose())}function f(u){let d=u.target;d.removeEventListener("dispose",f);let v=n.get(d);v!==void 0&&(n.delete(d),v.dispose())}function p(){t=new WeakMap,n=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:s,dispose:p}}function A2(e){let t={};function n(i){if(t[i]!==void 0)return t[i];let s=e.getExtension(i);return t[i]=s,s}return{has:function(i){return n(i)!==null},init:function(){n("EXT_color_buffer_float"),n("WEBGL_clip_cull_distance"),n("OES_texture_float_linear"),n("EXT_color_buffer_half_float"),n("WEBGL_multisampled_render_to_texture"),n("WEBGL_render_shared_exponent")},get:function(i){let s=n(i);return s===null&&mr("WebGLRenderer: "+i+" extension not supported."),s}}}function w2(e,t,n,i){let s={},a=new WeakMap;function r(p){let u=p.target;u.index!==null&&t.remove(u.index);for(let v in u.attributes)t.remove(u.attributes[v]);u.removeEventListener("dispose",r),delete s[u.id];let d=a.get(u);d&&(t.remove(d),a.delete(u)),i.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,n.memory.geometries--}function o(p,u){return s[u.id]===!0||(u.addEventListener("dispose",r),s[u.id]=!0,n.memory.geometries++),u}function l(p){let u=p.attributes;for(let d in u)t.update(u[d],e.ARRAY_BUFFER)}function c(p){let u=[],d=p.index,v=p.attributes.position,M=0;if(v===void 0)return;if(d!==null){let m=d.array;M=d.version;for(let S=0,y=m.length;S<y;S+=3){let E=m[S+0],A=m[S+1],C=m[S+2];u.push(E,A,A,C,C,E)}}else{let m=v.array;M=v.version;for(let S=0,y=m.length/3-1;S<y;S+=3){let E=S+0,A=S+1,C=S+2;u.push(E,A,A,C,C,E)}}let _=new(v.count>=65535?Cc:wc)(u,1);_.version=M;let h=a.get(p);h&&t.remove(h),a.set(p,_)}function f(p){let u=a.get(p);if(u){let d=p.index;d!==null&&u.version<d.version&&c(p)}else c(p);return a.get(p)}return{get:o,update:l,getWireframeAttribute:f}}function C2(e,t,n){let i;function s(p){i=p}let a,r;function o(p){a=p.type,r=p.bytesPerElement}function l(p,u){e.drawElements(i,u,a,p*r),n.update(u,i,1)}function c(p,u,d){d!==0&&(e.drawElementsInstanced(i,u,a,p*r,d),n.update(u,i,d))}function f(p,u,d){if(d===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,u,0,a,p,0,d);let M=0;for(let _=0;_<d;_++)M+=u[_];n.update(M,i,1)}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=f}function R2(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function i(a,r,o){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=o*(a/3);break;case e.LINES:n.lines+=o*(a/2);break;case e.LINE_STRIP:n.lines+=o*(a-1);break;case e.LINE_LOOP:n.lines+=o*a;break;case e.POINTS:n.points+=o*a;break;default:Ut("WebGLInfo: Unknown draw mode:",r);break}}function s(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:s,update:i}}function N2(e,t,n){let i=new WeakMap,s=new ze;function a(r,o,l){let c=r.morphTargetInfluences,f=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,p=f!==void 0?f.length:0,u=i.get(o);if(u===void 0||u.count!==p){let b=function(){C.dispose(),i.delete(o),o.removeEventListener("dispose",b)};u!==void 0&&u.texture.dispose();let d=o.morphAttributes.position!==void 0,v=o.morphAttributes.normal!==void 0,M=o.morphAttributes.color!==void 0,_=o.morphAttributes.position||[],h=o.morphAttributes.normal||[],m=o.morphAttributes.color||[],S=0;d===!0&&(S=1),v===!0&&(S=2),M===!0&&(S=3);let y=o.attributes.position.count*S,E=1;y>t.maxTextureSize&&(E=Math.ceil(y/t.maxTextureSize),y=t.maxTextureSize);let A=new Float32Array(y*E*4*p),C=new bc(A,y,E,p);C.type=Hi,C.needsUpdate=!0;let g=S*4;for(let R=0;R<p;R++){let U=_[R],I=h[R],F=m[R],D=y*E*4*R;for(let G=0;G<U.count;G++){let Y=G*g;d===!0&&(s.fromBufferAttribute(U,G),A[D+Y+0]=s.x,A[D+Y+1]=s.y,A[D+Y+2]=s.z,A[D+Y+3]=0),v===!0&&(s.fromBufferAttribute(I,G),A[D+Y+4]=s.x,A[D+Y+5]=s.y,A[D+Y+6]=s.z,A[D+Y+7]=0),M===!0&&(s.fromBufferAttribute(F,G),A[D+Y+8]=s.x,A[D+Y+9]=s.y,A[D+Y+10]=s.z,A[D+Y+11]=F.itemSize===4?s.w:1)}}u={count:p,texture:C,size:new It(y,E)},i.set(o,u),o.addEventListener("dispose",b)}if(r.isInstancedMesh===!0&&r.morphTexture!==null)l.getUniforms().setValue(e,"morphTexture",r.morphTexture,n);else{let d=0;for(let M=0;M<c.length;M++)d+=c[M];let v=o.morphTargetsRelative?1:1-d;l.getUniforms().setValue(e,"morphTargetBaseInfluence",v),l.getUniforms().setValue(e,"morphTargetInfluences",c)}l.getUniforms().setValue(e,"morphTargetsTexture",u.texture,n),l.getUniforms().setValue(e,"morphTargetsTextureSize",u.size)}return{update:a}}function D2(e,t,n,i,s){let a=new WeakMap;function r(c){let f=s.render.frame,p=c.geometry,u=t.get(c,p);if(a.get(u)!==f&&(t.update(u),a.set(u,f)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),a.get(c)!==f&&(n.update(c.instanceMatrix,e.ARRAY_BUFFER),c.instanceColor!==null&&n.update(c.instanceColor,e.ARRAY_BUFFER),a.set(c,f))),c.isSkinnedMesh){let d=c.skeleton;a.get(d)!==f&&(d.update(),a.set(d,f))}return u}function o(){a=new WeakMap}function l(c){let f=c.target;f.removeEventListener("dispose",l),i.releaseStatesOfObject(f),n.remove(f.instanceMatrix),f.instanceColor!==null&&n.remove(f.instanceColor)}return{update:r,dispose:o}}var U2={[Z0]:"LINEAR_TONE_MAPPING",[J0]:"REINHARD_TONE_MAPPING",[K0]:"CINEON_TONE_MAPPING",[Q0]:"ACES_FILMIC_TONE_MAPPING",[$0]:"AGX_TONE_MAPPING",[t_]:"NEUTRAL_TONE_MAPPING",[j0]:"CUSTOM_TONE_MAPPING"};function L2(e,t,n,i,s,a){let r=new Yn(t,n,{type:e,depthBuffer:s,stencilBuffer:a,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),o=null,l=null,c=new bn;c.setAttribute("position",new Se([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new Se([0,2,0,0,2,0],2));let f=new Xf({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),p=new Vt(c,f),u=new $o(-1,1,1,-1,0,1),d=null,v=null,M=!1,_,h=null,m=[],S=!1;this.setSize=function(y,E){r.setSize(y,E),o!==null&&o.setSize(y,E),l!==null&&l.setSize(y,E);for(let A=0;A<m.length;A++){let C=m[A];C.setSize&&C.setSize(y,E)}},this.setEffects=function(y){m=y,S=m.length>0&&m[0].isRenderPass===!0;let E=r.width,A=r.height;m.length>0&&o===null&&(o=new Yn(E,A,{type:Vi,depthBuffer:!1,stencilBuffer:!1}),l=new Yn(E,A,{type:Vi,depthBuffer:!1,stencilBuffer:!1}));for(let C=0;C<m.length;C++){let g=m[C];g.setSize&&g.setSize(E,A)}},this.begin=function(y,E){if(M||y.toneMapping===zi&&m.length===0)return!1;if(h=E,E!==null){let A=E.width,C=E.height;(r.width!==A||r.height!==C)&&this.setSize(A,C)}return S===!1&&y.setRenderTarget(r),_=y.toneMapping,y.toneMapping=zi,!0},this.hasRenderPass=function(){return S},this.end=function(y,E){y.toneMapping=_,M=!0;let A=r,C=o;for(let g=0;g<m.length;g++){let b=m[g];b.enabled!==!1&&(b.render(y,C,A,E),b.needsSwap!==!1&&(A=C,C=C===o?l:o))}if(d!==y.outputColorSpace||v!==y.toneMapping){d=y.outputColorSpace,v=y.toneMapping,f.defines={},te.getTransfer(d)===de&&(f.defines.SRGB_TRANSFER="");let g=U2[v];g&&(f.defines[g]=""),f.needsUpdate=!0}f.uniforms.tDiffuse.value=A.texture,y.setRenderTarget(h),y.render(p,u),h=null,M=!1},this.isCompositing=function(){return M},this.dispose=function(){r.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),c.dispose(),f.dispose()}}var tE=new zn,A_=new Na(1,1),eE=new bc,nE=new If,iE=new Oc,I1=[],P1=[],B1=new Float32Array(16),z1=new Float32Array(9),F1=new Float32Array(4);function ol(e,t,n){let i=e[0];if(i<=0||i>0)return e;let s=t*n,a=I1[s];if(a===void 0&&(a=new Float32Array(s),I1[s]=a),t!==0){i.toArray(a,0);for(let r=1,o=0;r!==t;++r)o+=n,e[r].toArray(a,o)}return a}function nn(e,t){if(e.length!==t.length)return!1;for(let n=0,i=e.length;n<i;n++)if(e[n]!==t[n])return!1;return!0}function sn(e,t){for(let n=0,i=t.length;n<i;n++)e[n]=t[n]}function tp(e,t){let n=P1[t];n===void 0&&(n=new Int32Array(t),P1[t]=n);for(let i=0;i!==t;++i)n[i]=e.allocateTextureUnit();return n}function O2(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function I2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(nn(n,t))return;e.uniform2fv(this.addr,t),sn(n,t)}}function P2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(nn(n,t))return;e.uniform3fv(this.addr,t),sn(n,t)}}function B2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(nn(n,t))return;e.uniform4fv(this.addr,t),sn(n,t)}}function z2(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(nn(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),sn(n,t)}else{if(nn(n,i))return;F1.set(i),e.uniformMatrix2fv(this.addr,!1,F1),sn(n,i)}}function F2(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(nn(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),sn(n,t)}else{if(nn(n,i))return;z1.set(i),e.uniformMatrix3fv(this.addr,!1,z1),sn(n,i)}}function H2(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(nn(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),sn(n,t)}else{if(nn(n,i))return;B1.set(i),e.uniformMatrix4fv(this.addr,!1,B1),sn(n,i)}}function V2(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function G2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(nn(n,t))return;e.uniform2iv(this.addr,t),sn(n,t)}}function k2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(nn(n,t))return;e.uniform3iv(this.addr,t),sn(n,t)}}function X2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(nn(n,t))return;e.uniform4iv(this.addr,t),sn(n,t)}}function W2(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function q2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(nn(n,t))return;e.uniform2uiv(this.addr,t),sn(n,t)}}function Y2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(nn(n,t))return;e.uniform3uiv(this.addr,t),sn(n,t)}}function Z2(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(nn(n,t))return;e.uniform4uiv(this.addr,t),sn(n,t)}}function J2(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s);let a;this.type===e.SAMPLER_2D_SHADOW?(A_.compareFunction=n.isReversedDepthBuffer()?Yd:qd,a=A_):a=tE,n.setTexture2D(t||a,s)}function K2(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTexture3D(t||nE,s)}function Q2(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTextureCube(t||iE,s)}function j2(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTexture2DArray(t||eE,s)}function $2(e){switch(e){case 5126:return O2;case 35664:return I2;case 35665:return P2;case 35666:return B2;case 35674:return z2;case 35675:return F2;case 35676:return H2;case 5124:case 35670:return V2;case 35667:case 35671:return G2;case 35668:case 35672:return k2;case 35669:case 35673:return X2;case 5125:return W2;case 36294:return q2;case 36295:return Y2;case 36296:return Z2;case 35678:case 36198:case 36298:case 36306:case 35682:return J2;case 35679:case 36299:case 36307:return K2;case 35680:case 36300:case 36308:case 36293:return Q2;case 36289:case 36303:case 36311:case 36292:return j2}}function tN(e,t){e.uniform1fv(this.addr,t)}function eN(e,t){let n=ol(t,this.size,2);e.uniform2fv(this.addr,n)}function nN(e,t){let n=ol(t,this.size,3);e.uniform3fv(this.addr,n)}function iN(e,t){let n=ol(t,this.size,4);e.uniform4fv(this.addr,n)}function sN(e,t){let n=ol(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function aN(e,t){let n=ol(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function rN(e,t){let n=ol(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function oN(e,t){e.uniform1iv(this.addr,t)}function lN(e,t){e.uniform2iv(this.addr,t)}function cN(e,t){e.uniform3iv(this.addr,t)}function uN(e,t){e.uniform4iv(this.addr,t)}function hN(e,t){e.uniform1uiv(this.addr,t)}function fN(e,t){e.uniform2uiv(this.addr,t)}function dN(e,t){e.uniform3uiv(this.addr,t)}function pN(e,t){e.uniform4uiv(this.addr,t)}function mN(e,t,n){let i=this.cache,s=t.length,a=tp(n,s);nn(i,a)||(e.uniform1iv(this.addr,a),sn(i,a));let r;this.type===e.SAMPLER_2D_SHADOW?r=A_:r=tE;for(let o=0;o!==s;++o)n.setTexture2D(t[o]||r,a[o])}function gN(e,t,n){let i=this.cache,s=t.length,a=tp(n,s);nn(i,a)||(e.uniform1iv(this.addr,a),sn(i,a));for(let r=0;r!==s;++r)n.setTexture3D(t[r]||nE,a[r])}function _N(e,t,n){let i=this.cache,s=t.length,a=tp(n,s);nn(i,a)||(e.uniform1iv(this.addr,a),sn(i,a));for(let r=0;r!==s;++r)n.setTextureCube(t[r]||iE,a[r])}function vN(e,t,n){let i=this.cache,s=t.length,a=tp(n,s);nn(i,a)||(e.uniform1iv(this.addr,a),sn(i,a));for(let r=0;r!==s;++r)n.setTexture2DArray(t[r]||eE,a[r])}function yN(e){switch(e){case 5126:return tN;case 35664:return eN;case 35665:return nN;case 35666:return iN;case 35674:return sN;case 35675:return aN;case 35676:return rN;case 5124:case 35670:return oN;case 35667:case 35671:return lN;case 35668:case 35672:return cN;case 35669:case 35673:return uN;case 5125:return hN;case 36294:return fN;case 36295:return dN;case 36296:return pN;case 35678:case 36198:case 36298:case 36306:case 35682:return mN;case 35679:case 36299:case 36307:return gN;case 35680:case 36300:case 36308:case 36293:return _N;case 36289:case 36303:case 36311:case 36292:return vN}}var w_=class{constructor(t,n,i){this.id=t,this.addr=i,this.cache=[],this.type=n.type,this.setValue=$2(n.type)}},C_=class{constructor(t,n,i){this.id=t,this.addr=i,this.cache=[],this.type=n.type,this.size=n.size,this.setValue=yN(n.type)}},R_=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,n,i){let s=this.seq;for(let a=0,r=s.length;a!==r;++a){let o=s[a];o.setValue(t,n[o.id],i)}}},E_=/(\w+)(\])?(\[|\.)?/g;function H1(e,t){e.seq.push(t),e.map[t.id]=t}function xN(e,t,n){let i=e.name,s=i.length;for(E_.lastIndex=0;;){let a=E_.exec(i),r=E_.lastIndex,o=a[1],l=a[2]==="]",c=a[3];if(l&&(o=o|0),c===void 0||c==="["&&r+2===s){H1(n,c===void 0?new w_(o,e,t):new C_(o,e,t));break}else{let p=n.map[o];p===void 0&&(p=new R_(o),H1(n,p)),n=p}}}var rl=class{constructor(t,n){this.seq=[],this.map={};let i=t.getProgramParameter(n,t.ACTIVE_UNIFORMS);for(let r=0;r<i;++r){let o=t.getActiveUniform(n,r),l=t.getUniformLocation(n,o.name);xN(o,l,this)}let s=[],a=[];for(let r of this.seq)r.type===t.SAMPLER_2D_SHADOW||r.type===t.SAMPLER_CUBE_SHADOW||r.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(r):a.push(r);s.length>0&&(this.seq=s.concat(a))}setValue(t,n,i,s){let a=this.map[n];a!==void 0&&a.setValue(t,i,s)}setOptional(t,n,i){let s=n[i];s!==void 0&&this.setValue(t,i,s)}static upload(t,n,i,s){for(let a=0,r=n.length;a!==r;++a){let o=n[a],l=i[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,s)}}static seqWithValue(t,n){let i=[];for(let s=0,a=t.length;s!==a;++s){let r=t[s];r.id in n&&i.push(r)}return i}};function V1(e,t,n){let i=e.createShader(t);return e.shaderSource(i,n),e.compileShader(i),i}var SN=37297,MN=0;function bN(e,t){let n=e.split(`
`),i=[],s=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let r=s;r<a;r++){let o=r+1;i.push(`${o===t?">":" "} ${o}: ${n[r]}`)}return i.join(`
`)}var G1=new Bt;function EN(e){te._getMatrix(G1,te.workingColorSpace,e);let t=`mat3( ${G1.elements.map(n=>n.toFixed(4))} )`;switch(te.getTransfer(e)){case xc:return[t,"LinearTransferOETF"];case de:return[t,"sRGBTransferOETF"];default:return Dt("WebGLProgram: Unsupported color space: ",e),[t,"LinearTransferOETF"]}}function k1(e,t,n){let i=e.getShaderParameter(t,e.COMPILE_STATUS),a=(e.getShaderInfoLog(t)||"").trim();if(i&&a==="")return"";let r=/ERROR: 0:(\d+)/.exec(a);if(r){let o=parseInt(r[1]);return n.toUpperCase()+`

`+a+`

`+bN(e.getShaderSource(t),o)}else return a}function TN(e,t){let n=EN(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,"}"].join(`
`)}var AN={[Z0]:"Linear",[J0]:"Reinhard",[K0]:"Cineon",[Q0]:"ACESFilmic",[$0]:"AgX",[t_]:"Neutral",[j0]:"Custom"};function wN(e,t){let n=AN[t];return n===void 0?(Dt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+e+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+e+"( vec3 color ) { return "+n+"ToneMapping( color ); }"}var Jd=new B;function CN(){te.getLuminanceCoefficients(Jd);let e=Jd.x.toFixed(4),t=Jd.y.toFixed(4),n=Jd.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${t}, ${n} );`,"	return dot( weights, rgb );","}"].join(`
`)}function RN(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(su).join(`
`)}function NN(e){let t=[];for(let n in e){let i=e[n];i!==!1&&t.push("#define "+n+" "+i)}return t.join(`
`)}function DN(e,t){let n={},i=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let s=0;s<i;s++){let a=e.getActiveAttrib(t,s),r=a.name,o=1;a.type===e.FLOAT_MAT2&&(o=2),a.type===e.FLOAT_MAT3&&(o=3),a.type===e.FLOAT_MAT4&&(o=4),n[r]={type:a.type,location:e.getAttribLocation(t,r),locationSize:o}}return n}function su(e){return e!==""}function X1(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function W1(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var UN=/^[ \t]*#include +<([\w\d./]+)>/gm;function N_(e){return e.replace(UN,ON)}var LN=new Map;function ON(e,t){let n=Xt[t];if(n===void 0){let i=LN.get(t);if(i!==void 0)n=Xt[i],Dt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,i);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return N_(n)}var IN=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function q1(e){return e.replace(IN,PN)}function PN(e,t,n,i){let s="";for(let a=parseInt(t);a<parseInt(n);a++)s+=i.replace(/\[\s*i\s*\]/g,"[ "+a+" ]").replace(/UNROLLED_LOOP_INDEX/g,a);return s}function Y1(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?t+=`
#define HIGH_PRECISION`:e.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}var BN={[Yc]:"SHADOWMAP_TYPE_PCF",[tl]:"SHADOWMAP_TYPE_VSM"};function zN(e){return BN[e.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var FN={[Ia]:"ENVMAP_TYPE_CUBE",[xr]:"ENVMAP_TYPE_CUBE",[Zc]:"ENVMAP_TYPE_CUBE_UV"};function HN(e){return e.envMap===!1?"ENVMAP_TYPE_CUBE":FN[e.envMapMode]||"ENVMAP_TYPE_CUBE"}var VN={[xr]:"ENVMAP_MODE_REFRACTION"};function GN(e){return e.envMap===!1?"ENVMAP_MODE_REFLECTION":VN[e.envMapMode]||"ENVMAP_MODE_REFLECTION"}var kN={[Y0]:"ENVMAP_BLENDING_MULTIPLY",[u1]:"ENVMAP_BLENDING_MIX",[h1]:"ENVMAP_BLENDING_ADD"};function XN(e){return e.envMap===!1?"ENVMAP_BLENDING_NONE":kN[e.combine]||"ENVMAP_BLENDING_NONE"}function WN(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,i=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,n),112)),texelHeight:i,maxMip:n}}function qN(e,t,n,i){let s=e.getContext(),a=n.defines,r=n.vertexShader,o=n.fragmentShader,l=zN(n),c=HN(n),f=GN(n),p=XN(n),u=WN(n),d=RN(n),v=NN(a),M=s.createProgram(),_,h,m=n.glslVersion?"#version "+n.glslVersion+`
`:"";n.isRawShaderMaterial?(_=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,v].filter(su).join(`
`),_.length>0&&(_+=`
`),h=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,v].filter(su).join(`
`),h.length>0&&(h+=`
`)):(_=[Y1(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,v,n.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",n.batching?"#define USE_BATCHING":"",n.batchingColor?"#define USE_BATCHING_COLOR":"",n.instancing?"#define USE_INSTANCING":"",n.instancingColor?"#define USE_INSTANCING_COLOR":"",n.instancingMorph?"#define USE_INSTANCING_MORPH":"",n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.map?"#define USE_MAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+f:"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.displacementMap?"#define USE_DISPLACEMENTMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.mapUv?"#define MAP_UV "+n.mapUv:"",n.alphaMapUv?"#define ALPHAMAP_UV "+n.alphaMapUv:"",n.lightMapUv?"#define LIGHTMAP_UV "+n.lightMapUv:"",n.aoMapUv?"#define AOMAP_UV "+n.aoMapUv:"",n.emissiveMapUv?"#define EMISSIVEMAP_UV "+n.emissiveMapUv:"",n.bumpMapUv?"#define BUMPMAP_UV "+n.bumpMapUv:"",n.normalMapUv?"#define NORMALMAP_UV "+n.normalMapUv:"",n.displacementMapUv?"#define DISPLACEMENTMAP_UV "+n.displacementMapUv:"",n.metalnessMapUv?"#define METALNESSMAP_UV "+n.metalnessMapUv:"",n.roughnessMapUv?"#define ROUGHNESSMAP_UV "+n.roughnessMapUv:"",n.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+n.anisotropyMapUv:"",n.clearcoatMapUv?"#define CLEARCOATMAP_UV "+n.clearcoatMapUv:"",n.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+n.clearcoatNormalMapUv:"",n.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+n.clearcoatRoughnessMapUv:"",n.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+n.iridescenceMapUv:"",n.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+n.iridescenceThicknessMapUv:"",n.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+n.sheenColorMapUv:"",n.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+n.sheenRoughnessMapUv:"",n.specularMapUv?"#define SPECULARMAP_UV "+n.specularMapUv:"",n.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+n.specularColorMapUv:"",n.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+n.specularIntensityMapUv:"",n.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+n.transmissionMapUv:"",n.thicknessMapUv?"#define THICKNESSMAP_UV "+n.thicknessMapUv:"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexNormals?"#define HAS_NORMAL":"",n.vertexColors?"#define USE_COLOR":"",n.vertexAlphas?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.flatShading?"#define FLAT_SHADED":"",n.skinning?"#define USE_SKINNING":"",n.morphTargets?"#define USE_MORPHTARGETS":"",n.morphNormals&&n.flatShading===!1?"#define USE_MORPHNORMALS":"",n.morphColors?"#define USE_MORPHCOLORS":"",n.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+n.morphTextureStride:"",n.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+n.morphTargetsCount:"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+l:"",n.sizeAttenuation?"#define USE_SIZEATTENUATION":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(su).join(`
`),h=[Y1(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,v,n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",n.map?"#define USE_MAP":"",n.matcap?"#define USE_MATCAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+c:"",n.envMap?"#define "+f:"",n.envMap?"#define "+p:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoat?"#define USE_CLEARCOAT":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.dispersion?"#define USE_DISPERSION":"",n.retroreflection?"#define USE_RETROREFLECTION":"",n.iridescence?"#define USE_IRIDESCENCE":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaTest?"#define USE_ALPHATEST":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.sheen?"#define USE_SHEEN":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexColors||n.instancingColor?"#define USE_COLOR":"",n.vertexAlphas||n.batchingColor?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.gradientMap?"#define USE_GRADIENTMAP":"",n.flatShading?"#define FLAT_SHADED":"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+l:"",n.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",n.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",n.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",n.toneMapping!==zi?"#define TONE_MAPPING":"",n.toneMapping!==zi?Xt.tonemapping_pars_fragment:"",n.toneMapping!==zi?wN("toneMapping",n.toneMapping):"",n.dithering?"#define DITHERING":"",n.opaque?"#define OPAQUE":"",Xt.colorspace_pars_fragment,TN("linearToOutputTexel",n.outputColorSpace),CN(),n.useDepthPacking?"#define DEPTH_PACKING "+n.depthPacking:"",`
`].filter(su).join(`
`)),r=N_(r),r=X1(r,n),r=W1(r,n),o=N_(o),o=X1(o,n),o=W1(o,n),r=q1(r),o=q1(o),n.isRawShaderMaterial!==!0&&(m=`#version 300 es
`,_=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+_,h=["#define varying in",n.glslVersion===u_?"":"layout(location = 0) out highp vec4 pc_fragColor;",n.glslVersion===u_?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+h);let S=m+_+r,y=m+h+o,E=V1(s,s.VERTEX_SHADER,S),A=V1(s,s.FRAGMENT_SHADER,y);s.attachShader(M,E),s.attachShader(M,A),n.index0AttributeName!==void 0?s.bindAttribLocation(M,0,n.index0AttributeName):n.hasPositionAttribute===!0&&s.bindAttribLocation(M,0,"position"),s.linkProgram(M);function C(U){if(e.debug.checkShaderErrors){let I=s.getProgramInfoLog(M)||"",F=s.getShaderInfoLog(E)||"",D=s.getShaderInfoLog(A)||"",G=I.trim(),Y=F.trim(),Z=D.trim(),it=!0,W=!0;if(s.getProgramParameter(M,s.LINK_STATUS)===!1)if(it=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(s,M,E,A);else{let $=k1(s,E,"vertex"),et=k1(s,A,"fragment");Ut("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(M,s.VALIDATE_STATUS)+`

Material Name: `+U.name+`
Material Type: `+U.type+`

Program Info Log: `+G+`
`+$+`
`+et)}else G!==""?Dt("WebGLProgram: Program Info Log:",G):(Y===""||Z==="")&&(W=!1);W&&(U.diagnostics={runnable:it,programLog:G,vertexShader:{log:Y,prefix:_},fragmentShader:{log:Z,prefix:h}})}s.deleteShader(E),s.deleteShader(A),g=new rl(s,M),b=DN(s,M)}let g;this.getUniforms=function(){return g===void 0&&C(this),g};let b;this.getAttributes=function(){return b===void 0&&C(this),b};let R=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=s.getProgramParameter(M,SN)),R},this.destroy=function(){i.releaseStatesOfProgram(this),s.deleteProgram(M),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=MN++,this.cacheKey=t,this.usedTimes=1,this.program=M,this.vertexShader=E,this.fragmentShader=A,this}var YN=0,D_=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,n,i){let s=this._getShaderCacheForMaterial(t);return s.has(n)===!1&&(s.add(n),n.usedTimes++),s.has(i)===!1&&(s.add(i),i.usedTimes++),this}remove(t){let n=this.materialCache.get(t);for(let i of n)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let n=this.materialCache,i=n.get(t);return i===void 0&&(i=new Set,n.set(t,i)),i}_getShaderStage(t){let n=this.shaderCache,i=n.get(t);return i===void 0&&(i=new U_(t),n.set(t,i)),i}},U_=class{constructor(t){this.id=YN++,this.code=t,this.usedTimes=0}};function ZN(e){return e===za||e===tu||e===eu}function JN(e,t,n,i,s,a){let r=new Ec,o=new D_,l=new Set,c=[],f=new Map,p=i.logarithmicDepthBuffer,u=i.precision,d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function v(g){return l.add(g),g===0?"uv":`uv${g}`}function M(g,b,R,U,I,F){let D=U.fog,G=I.geometry,Y=g.isMeshStandardMaterial||g.isMeshLambertMaterial||g.isMeshPhongMaterial?U.environment:null,Z=g.isMeshStandardMaterial||g.isMeshLambertMaterial&&!g.envMap||g.isMeshPhongMaterial&&!g.envMap,it=t.get(g.envMap||Y,Z),W=it&&it.mapping===Zc?it.image.height:null,$=d[g.type];g.precision!==null&&(u=i.getMaxPrecision(g.precision),u!==g.precision&&Dt("WebGLProgram.getParameters:",g.precision,"not supported, using",u,"instead."));let et=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,At=et!==void 0?et.length:0,St=0;G.morphAttributes.position!==void 0&&(St=1),G.morphAttributes.normal!==void 0&&(St=2),G.morphAttributes.color!==void 0&&(St=3);let ae,Wt,ne,q;if($){let Ae=gs[$];ae=Ae.vertexShader,Wt=Ae.fragmentShader}else{ae=g.vertexShader,Wt=g.fragmentShader;let Ae=o.getVertexShaderStage(g),ue=o.getFragmentShaderStage(g);o.update(g,Ae,ue),ne=Ae.id,q=ue.id}let tt=e.getRenderTarget(),vt=e.state.buffers.depth.getReversed(),Ot=I.isInstancedMesh===!0,_t=I.isBatchedMesh===!0,Gt=!!g.map,Ge=!!g.matcap,qt=!!it,ie=!!g.aoMap,oe=!!g.lightMap,Yt=!!g.bumpMap&&g.wireframe===!1,_e=!!g.normalMap,ke=!!g.displacementMap,an=!!g.emissiveMap,Te=!!g.metalnessMap,st=!!g.roughnessMap,N=g.anisotropy>0,jt=g.clearcoat>0,rt=g.dispersion>0,w=g.retroreflectivity>0,x=g.iridescence>0,P=g.sheen>0,z=g.transmission>0,k=N&&!!g.anisotropyMap,at=jt&&!!g.clearcoatMap,ot=jt&&!!g.clearcoatNormalMap,J=jt&&!!g.clearcoatRoughnessMap,j=x&&!!g.iridescenceMap,lt=x&&!!g.iridescenceThicknessMap,wt=P&&!!g.sheenColorMap,ft=P&&!!g.sheenRoughnessMap,ct=!!g.specularMap,Ct=!!g.specularColorMap,Nt=!!g.specularIntensityMap,zt=z&&!!g.transmissionMap,O=z&&!!g.thicknessMap,ut=!!g.gradientMap,K=!!g.alphaMap,ht=g.alphaTest>0,gt=!!g.alphaHash,nt=!!g.extensions,Rt=zi;g.toneMapped&&(tt===null||tt.isXRRenderTarget===!0)&&(Rt=e.toneMapping);let Et={shaderID:$,shaderType:g.type,shaderName:g.name,vertexShader:ae,fragmentShader:Wt,defines:g.defines,customVertexShaderID:ne,customFragmentShaderID:q,isRawShaderMaterial:g.isRawShaderMaterial===!0,glslVersion:g.glslVersion,precision:u,batching:_t,batchingColor:_t&&I._colorsTexture!==null,instancing:Ot,instancingColor:Ot&&I.instanceColor!==null,instancingMorph:Ot&&I.morphTexture!==null,outputColorSpace:tt===null?e.outputColorSpace:tt.isXRRenderTarget===!0?tt.texture.colorSpace:te.workingColorSpace,alphaToCoverage:!!g.alphaToCoverage,map:Gt,matcap:Ge,envMap:qt,envMapMode:qt&&it.mapping,envMapCubeUVHeight:W,aoMap:ie,lightMap:oe,bumpMap:Yt,normalMap:_e,displacementMap:ke,emissiveMap:an,normalMapObjectSpace:_e&&g.normalMapType===p1,normalMapTangentSpace:_e&&g.normalMapType===Wd,packedNormalMap:_e&&g.normalMapType===Wd&&ZN(g.normalMap.format),metalnessMap:Te,roughnessMap:st,anisotropy:N,anisotropyMap:k,clearcoat:jt,clearcoatMap:at,clearcoatNormalMap:ot,clearcoatRoughnessMap:J,dispersion:rt,retroreflection:w,iridescence:x,iridescenceMap:j,iridescenceThicknessMap:lt,sheen:P,sheenColorMap:wt,sheenRoughnessMap:ft,specularMap:ct,specularColorMap:Ct,specularIntensityMap:Nt,transmission:z,transmissionMap:zt,thicknessMap:O,gradientMap:ut,opaque:g.transparent===!1&&g.blending===el&&g.alphaToCoverage===!1,alphaMap:K,alphaTest:ht,alphaHash:gt,combine:g.combine,mapUv:Gt&&v(g.map.channel),aoMapUv:ie&&v(g.aoMap.channel),lightMapUv:oe&&v(g.lightMap.channel),bumpMapUv:Yt&&v(g.bumpMap.channel),normalMapUv:_e&&v(g.normalMap.channel),displacementMapUv:ke&&v(g.displacementMap.channel),emissiveMapUv:an&&v(g.emissiveMap.channel),metalnessMapUv:Te&&v(g.metalnessMap.channel),roughnessMapUv:st&&v(g.roughnessMap.channel),anisotropyMapUv:k&&v(g.anisotropyMap.channel),clearcoatMapUv:at&&v(g.clearcoatMap.channel),clearcoatNormalMapUv:ot&&v(g.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:J&&v(g.clearcoatRoughnessMap.channel),iridescenceMapUv:j&&v(g.iridescenceMap.channel),iridescenceThicknessMapUv:lt&&v(g.iridescenceThicknessMap.channel),sheenColorMapUv:wt&&v(g.sheenColorMap.channel),sheenRoughnessMapUv:ft&&v(g.sheenRoughnessMap.channel),specularMapUv:ct&&v(g.specularMap.channel),specularColorMapUv:Ct&&v(g.specularColorMap.channel),specularIntensityMapUv:Nt&&v(g.specularIntensityMap.channel),transmissionMapUv:zt&&v(g.transmissionMap.channel),thicknessMapUv:O&&v(g.thicknessMap.channel),alphaMapUv:K&&v(g.alphaMap.channel),vertexTangents:!!G.attributes.tangent&&(_e||N),vertexNormals:!!G.attributes.normal,vertexColors:g.vertexColors,vertexAlphas:g.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,pointsUvs:I.isPoints===!0&&!!G.attributes.uv&&(Gt||K),fog:!!D,useFog:g.fog===!0,fogExp2:!!D&&D.isFogExp2,flatShading:g.wireframe===!1&&(g.flatShading===!0||G.attributes.normal===void 0&&_e===!1&&(g.isMeshLambertMaterial||g.isMeshPhongMaterial||g.isMeshStandardMaterial||g.isMeshPhysicalMaterial)),sizeAttenuation:g.sizeAttenuation===!0,logarithmicDepthBuffer:p,reversedDepthBuffer:vt,skinning:I.isSkinnedMesh===!0,hasPositionAttribute:G.attributes.position!==void 0,morphTargets:G.morphAttributes.position!==void 0,morphNormals:G.morphAttributes.normal!==void 0,morphColors:G.morphAttributes.color!==void 0,morphTargetsCount:At,morphTextureStride:St,numSunLights:b.sun.length,numDirLights:b.directional.length,numPointLights:b.point.length,numSpotLights:b.spot.length,numSpotLightMaps:b.spotLightMap.length,numRectAreaLights:b.rectArea.length,numHemiLights:b.hemi.length,numSunLightShadows:b.sunShadowMap.length,numDirLightShadows:b.directionalShadowMap.length,numPointLightShadows:b.pointShadowMap.length,numSpotLightShadows:b.spotShadowMap.length,numSpotLightShadowsWithMaps:b.numSpotLightShadowsWithMaps,numLightProbes:b.numLightProbes,numLightProbeGrids:F.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:g.dithering,shadowMapEnabled:e.shadowMap.enabled&&R.length>0,shadowMapType:e.shadowMap.type,toneMapping:Rt,decodeVideoTexture:Gt&&g.map.isVideoTexture===!0&&te.getTransfer(g.map.colorSpace)===de,decodeVideoTextureEmissive:an&&g.emissiveMap.isVideoTexture===!0&&te.getTransfer(g.emissiveMap.colorSpace)===de,premultipliedAlpha:g.premultipliedAlpha,doubleSided:g.side===ds,flipSided:g.side===Fn,useDepthPacking:g.depthPacking>=0,depthPacking:g.depthPacking||0,index0AttributeName:g.index0AttributeName,extensionClipCullDistance:nt&&g.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(nt&&g.extensions.multiDraw===!0||_t)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:g.customProgramCacheKey()};return Et.vertexUv1s=l.has(1),Et.vertexUv2s=l.has(2),Et.vertexUv3s=l.has(3),l.clear(),Et}function _(g){let b=[];if(g.shaderID?b.push(g.shaderID):(b.push(g.customVertexShaderID),b.push(g.customFragmentShaderID)),g.defines!==void 0)for(let R in g.defines)b.push(R),b.push(g.defines[R]);return g.isRawShaderMaterial===!1&&(h(b,g),m(b,g),b.push(e.outputColorSpace)),b.push(g.customProgramCacheKey),b.join()}function h(g,b){g.push(b.precision),g.push(b.outputColorSpace),g.push(b.envMapMode),g.push(b.envMapCubeUVHeight),g.push(b.mapUv),g.push(b.alphaMapUv),g.push(b.lightMapUv),g.push(b.aoMapUv),g.push(b.bumpMapUv),g.push(b.normalMapUv),g.push(b.displacementMapUv),g.push(b.emissiveMapUv),g.push(b.metalnessMapUv),g.push(b.roughnessMapUv),g.push(b.anisotropyMapUv),g.push(b.clearcoatMapUv),g.push(b.clearcoatNormalMapUv),g.push(b.clearcoatRoughnessMapUv),g.push(b.iridescenceMapUv),g.push(b.iridescenceThicknessMapUv),g.push(b.sheenColorMapUv),g.push(b.sheenRoughnessMapUv),g.push(b.specularMapUv),g.push(b.specularColorMapUv),g.push(b.specularIntensityMapUv),g.push(b.transmissionMapUv),g.push(b.thicknessMapUv),g.push(b.combine),g.push(b.fogExp2),g.push(b.sizeAttenuation),g.push(b.morphTargetsCount),g.push(b.morphAttributeCount),g.push(b.numSunLights),g.push(b.numDirLights),g.push(b.numPointLights),g.push(b.numSpotLights),g.push(b.numSpotLightMaps),g.push(b.numHemiLights),g.push(b.numRectAreaLights),g.push(b.numSunLightShadows),g.push(b.numDirLightShadows),g.push(b.numPointLightShadows),g.push(b.numSpotLightShadows),g.push(b.numSpotLightShadowsWithMaps),g.push(b.numLightProbes),g.push(b.shadowMapType),g.push(b.toneMapping),g.push(b.numClippingPlanes),g.push(b.numClipIntersection),g.push(b.depthPacking)}function m(g,b){r.disableAll(),b.instancing&&r.enable(0),b.instancingColor&&r.enable(1),b.instancingMorph&&r.enable(2),b.matcap&&r.enable(3),b.envMap&&r.enable(4),b.normalMapObjectSpace&&r.enable(5),b.normalMapTangentSpace&&r.enable(6),b.clearcoat&&r.enable(7),b.iridescence&&r.enable(8),b.alphaTest&&r.enable(9),b.vertexColors&&r.enable(10),b.vertexAlphas&&r.enable(11),b.vertexUv1s&&r.enable(12),b.vertexUv2s&&r.enable(13),b.vertexUv3s&&r.enable(14),b.vertexTangents&&r.enable(15),b.anisotropy&&r.enable(16),b.alphaHash&&r.enable(17),b.batching&&r.enable(18),b.dispersion&&r.enable(19),b.retroreflection&&r.enable(24),b.batchingColor&&r.enable(20),b.gradientMap&&r.enable(21),b.packedNormalMap&&r.enable(22),b.vertexNormals&&r.enable(23),g.push(r.mask),r.disableAll(),b.fog&&r.enable(0),b.useFog&&r.enable(1),b.flatShading&&r.enable(2),b.logarithmicDepthBuffer&&r.enable(3),b.reversedDepthBuffer&&r.enable(4),b.skinning&&r.enable(5),b.morphTargets&&r.enable(6),b.morphNormals&&r.enable(7),b.morphColors&&r.enable(8),b.premultipliedAlpha&&r.enable(9),b.shadowMapEnabled&&r.enable(10),b.doubleSided&&r.enable(11),b.flipSided&&r.enable(12),b.useDepthPacking&&r.enable(13),b.dithering&&r.enable(14),b.transmission&&r.enable(15),b.sheen&&r.enable(16),b.opaque&&r.enable(17),b.pointsUvs&&r.enable(18),b.decodeVideoTexture&&r.enable(19),b.decodeVideoTextureEmissive&&r.enable(20),b.alphaToCoverage&&r.enable(21),b.numLightProbeGrids>0&&r.enable(22),b.hasPositionAttribute&&r.enable(23),g.push(r.mask)}function S(g){let b=d[g.type],R;if(b){let U=gs[b];R=C1.clone(U.uniforms)}else R=g.uniforms;return R}function y(g,b){let R=f.get(b);return R!==void 0?++R.usedTimes:(R=new qN(e,b,g,s),c.push(R),f.set(b,R)),R}function E(g){if(--g.usedTimes===0){let b=c.indexOf(g);c[b]=c[c.length-1],c.pop(),f.delete(g.cacheKey),g.destroy()}}function A(g){o.remove(g)}function C(){o.dispose()}return{getParameters:M,getProgramCacheKey:_,getUniforms:S,acquireProgram:y,releaseProgram:E,releaseShaderCache:A,programs:c,dispose:C}}function KN(){let e=new WeakMap;function t(r){return e.has(r)}function n(r){let o=e.get(r);return o===void 0&&(o={},e.set(r,o)),o}function i(r){e.delete(r)}function s(r,o,l){e.get(r)[o]=l}function a(){e=new WeakMap}return{has:t,get:n,remove:i,update:s,dispose:a}}function QN(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.material.id!==t.material.id?e.material.id-t.material.id:e.materialVariant!==t.materialVariant?e.materialVariant-t.materialVariant:e.z!==t.z?e.z-t.z:e.id-t.id}function Z1(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.z!==t.z?t.z-e.z:e.id-t.id}function J1(){let e=[],t=0,n=[],i=[],s=[];function a(){t=0,n.length=0,i.length=0,s.length=0}function r(u){let d=0;return u.isInstancedMesh&&(d+=2),u.isSkinnedMesh&&(d+=1),d}function o(u,d,v,M,_,h){let m=e[t];return m===void 0?(m={id:u.id,object:u,geometry:d,material:v,materialVariant:r(u),groupOrder:M,renderOrder:u.renderOrder,z:_,group:h},e[t]=m):(m.id=u.id,m.object=u,m.geometry=d,m.material=v,m.materialVariant=r(u),m.groupOrder=M,m.renderOrder=u.renderOrder,m.z=_,m.group=h),t++,m}function l(u,d,v,M,_,h,m){m.reversedDepth===!0&&(_=-_);let S=o(u,d,v,M,_,h);v.transmission>0?i.push(S):v.transparent===!0?s.push(S):n.push(S)}function c(u,d,v,M,_,h){let m=o(u,d,v,M,_,h);v.transmission>0?i.unshift(m):v.transparent===!0?s.unshift(m):n.unshift(m)}function f(u,d){n.length>1&&n.sort(u||QN),i.length>1&&i.sort(d||Z1),s.length>1&&s.sort(d||Z1)}function p(){for(let u=t,d=e.length;u<d;u++){let v=e[u];if(v.id===null)break;v.id=null,v.object=null,v.geometry=null,v.material=null,v.group=null}}return{opaque:n,transmissive:i,transparent:s,init:a,push:l,unshift:c,finish:p,sort:f}}function jN(){let e=new WeakMap;function t(i,s){let a=e.get(i),r;return a===void 0?(r=new J1,e.set(i,[r])):s>=a.length?(r=new J1,a.push(r)):r=a[s],r}function n(){e=new WeakMap}return{get:t,dispose:n}}function $N(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={direction:new B,color:new Ht};break;case"SpotLight":n={position:new B,direction:new B,color:new Ht,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":n={position:new B,color:new Ht,distance:0,decay:0};break;case"HemisphereLight":n={direction:new B,skyColor:new Ht,groundColor:new Ht};break;case"RectAreaLight":n={color:new Ht,position:new B,halfWidth:new B,halfHeight:new B};break}return e[t.id]=n,n}}}function tD(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new It};break;case"SpotLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new It};break;case"PointLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new It,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[t.id]=n,n}}}var eD=0;function nD(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+(t.map?1:0)-(e.map?1:0)}function iD(e){let t=new $N,n=tD(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)i.probe.push(new B);let s=new B,a=new Oe,r=new Oe;function o(c){let f=0,p=0,u=0;for(let I=0;I<9;I++)i.probe[I].set(0,0,0);let d=0,v=0,M=0,_=0,h=0,m=0,S=0,y=0,E=0,A=0,C=0,g=0,b=0,R=0;c.sort(nD);for(let I=0,F=c.length;I<F;I++){let D=c[I],G=D.color,Y=D.intensity,Z=D.distance,it=null;if(D.shadow&&D.shadow.map&&(D.shadow.map.texture.format===za?it=D.shadow.map.texture:it=D.shadow.map.depthTexture||D.shadow.map.texture),D.isAmbientLight)f+=G.r*Y,p+=G.g*Y,u+=G.b*Y;else if(D.isLightProbe){for(let W=0;W<9;W++)i.probe[W].addScaledVector(D.sh.coefficients[W],Y);R++}else if(D.isSunLight){let W=t.get(D);if(W.color.copy(D.color).multiplyScalar(D.intensity),D.castShadow){let $=D.shadow,et=n.get(D);et.shadowIntensity=$.intensity,et.shadowBias=$.bias,et.shadowNormalBias=$.normalBias,et.shadowRadius=$.radius,et.shadowMapSize.copy($.mapSize).multiply($.getFrameExtents()),i.sunShadow[v]=et,i.sunShadowMap[v]=it;let At=$.getViewportCount();for(let St=0;St<At;St++)i.sunShadowMatrix[M+St]=$.getMatrix(St),i.sunShadowCascade[M+St]=$._cascadeData[St];M+=At,v++}i.sun[d]=W,d++}else if(D.isDirectionalLight){let W=t.get(D);if(W.color.copy(D.color).multiplyScalar(D.intensity),D.castShadow){let $=D.shadow,et=n.get(D);et.shadowIntensity=$.intensity,et.shadowBias=$.bias,et.shadowNormalBias=$.normalBias,et.shadowRadius=$.radius,et.shadowMapSize=$.mapSize,i.directionalShadow[_]=et,i.directionalShadowMap[_]=it,i.directionalShadowMatrix[_]=D.shadow.matrix,E++}i.directional[_]=W,_++}else if(D.isSpotLight){let W=t.get(D);W.position.setFromMatrixPosition(D.matrixWorld),W.color.copy(G).multiplyScalar(Y),W.distance=Z,W.coneCos=Math.cos(D.angle),W.penumbraCos=Math.cos(D.angle*(1-D.penumbra)),W.decay=D.decay,i.spot[m]=W;let $=D.shadow;if(D.map&&(i.spotLightMap[g]=D.map,g++,$.updateMatrices(D),D.castShadow&&b++),i.spotLightMatrix[m]=$.matrix,D.castShadow){let et=n.get(D);et.shadowIntensity=$.intensity,et.shadowBias=$.bias,et.shadowNormalBias=$.normalBias,et.shadowRadius=$.radius,et.shadowMapSize=$.mapSize,i.spotShadow[m]=et,i.spotShadowMap[m]=it,C++}m++}else if(D.isRectAreaLight){let W=t.get(D);W.color.copy(G).multiplyScalar(Y),W.halfWidth.set(D.width*.5,0,0),W.halfHeight.set(0,D.height*.5,0),i.rectArea[S]=W,S++}else if(D.isPointLight){let W=t.get(D);if(W.color.copy(D.color).multiplyScalar(D.intensity),W.distance=D.distance,W.decay=D.decay,D.castShadow){let $=D.shadow,et=n.get(D);et.shadowIntensity=$.intensity,et.shadowBias=$.bias,et.shadowNormalBias=$.normalBias,et.shadowRadius=$.radius,et.shadowMapSize=$.mapSize,et.shadowCameraNear=$.camera.near,et.shadowCameraFar=$.camera.far,i.pointShadow[h]=et,i.pointShadowMap[h]=it,i.pointShadowMatrix[h]=D.shadow.matrix,A++}i.point[h]=W,h++}else if(D.isHemisphereLight){let W=t.get(D);W.skyColor.copy(D.color).multiplyScalar(Y),W.groundColor.copy(D.groundColor).multiplyScalar(Y),i.hemi[y]=W,y++}}S>0&&(e.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=dt.LTC_FLOAT_1,i.rectAreaLTC2=dt.LTC_FLOAT_2):(i.rectAreaLTC1=dt.LTC_HALF_1,i.rectAreaLTC2=dt.LTC_HALF_2)),i.ambient[0]=f,i.ambient[1]=p,i.ambient[2]=u;let U=i.hash;(U.sunLength!==d||U.directionalLength!==_||U.pointLength!==h||U.spotLength!==m||U.rectAreaLength!==S||U.hemiLength!==y||U.numSunShadows!==v||U.numDirectionalShadows!==E||U.numPointShadows!==A||U.numSpotShadows!==C||U.numSpotMaps!==g||U.numLightProbes!==R)&&(i.sun.length=d,i.directional.length=_,i.spot.length=m,i.rectArea.length=S,i.point.length=h,i.hemi.length=y,i.sunShadow.length=v,i.sunShadowMap.length=v,i.sunShadowMatrix.length=M,i.sunShadowCascade.length=M,i.directionalShadow.length=E,i.directionalShadowMap.length=E,i.directionalShadowMatrix.length=E,i.pointShadow.length=A,i.pointShadowMap.length=A,i.pointShadowMatrix.length=A,i.spotShadow.length=C,i.spotShadowMap.length=C,i.spotLightMatrix.length=C+g-b,i.spotLightMap.length=g,i.numSpotLightShadowsWithMaps=b,i.numLightProbes=R,U.sunLength=d,U.directionalLength=_,U.pointLength=h,U.spotLength=m,U.rectAreaLength=S,U.hemiLength=y,U.numSunShadows=v,U.numDirectionalShadows=E,U.numPointShadows=A,U.numSpotShadows=C,U.numSpotMaps=g,U.numLightProbes=R,i.version=eD++)}function l(c,f){let p=0,u=0,d=0,v=0,M=0,_=0,h=f.matrixWorldInverse;for(let m=0,S=c.length;m<S;m++){let y=c[m];if(y.isSunLight){let E=i.sun[p];E.direction.setFromMatrixPosition(y.matrixWorld),E.direction.transformDirection(h),p++}else if(y.isDirectionalLight){let E=i.directional[u];E.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),E.direction.sub(s),E.direction.transformDirection(h),u++}else if(y.isSpotLight){let E=i.spot[v];E.position.setFromMatrixPosition(y.matrixWorld),E.position.applyMatrix4(h),E.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),E.direction.sub(s),E.direction.transformDirection(h),v++}else if(y.isRectAreaLight){let E=i.rectArea[M];E.position.setFromMatrixPosition(y.matrixWorld),E.position.applyMatrix4(h),r.identity(),a.copy(y.matrixWorld),a.premultiply(h),r.extractRotation(a),E.halfWidth.set(y.width*.5,0,0),E.halfHeight.set(0,y.height*.5,0),E.halfWidth.applyMatrix4(r),E.halfHeight.applyMatrix4(r),M++}else if(y.isPointLight){let E=i.point[d];E.position.setFromMatrixPosition(y.matrixWorld),E.position.applyMatrix4(h),d++}else if(y.isHemisphereLight){let E=i.hemi[_];E.direction.setFromMatrixPosition(y.matrixWorld),E.direction.transformDirection(h),_++}}}return{setup:o,setupView:l,state:i}}function K1(e){let t=new iD(e),n=[],i=[],s=[];function a(u){p.camera=u,n.length=0,i.length=0,s.length=0}function r(u){n.push(u)}function o(u){i.push(u)}function l(u){s.push(u)}function c(){t.setup(n)}function f(u){t.setupView(n,u)}let p={lightsArray:n,shadowsArray:i,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:p,setupLights:c,setupLightsView:f,pushLight:r,pushShadow:o,pushLightProbeGrid:l}}function sD(e){let t=new WeakMap;function n(s,a=0){let r=t.get(s),o;return r===void 0?(o=new K1(e),t.set(s,[o])):a>=r.length?(o=new K1(e),r.push(o)):o=r[a],o}function i(){t=new WeakMap}return{get:n,dispose:i}}var aD=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,rD=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,oD=[new B(1,0,0),new B(-1,0,0),new B(0,1,0),new B(0,-1,0),new B(0,0,1),new B(0,0,-1)],lD=[new B(0,-1,0),new B(0,-1,0),new B(0,0,1),new B(0,0,-1),new B(0,-1,0),new B(0,-1,0)],Q1=new Oe,iu=new B,T_=new B;function cD(e,t,n){let i=new Jo,s=new It,a=new It,r=new ze,o=new Wf,l=new qf,c={},f=n.maxTextureSize,p={[Oa]:Fn,[Fn]:Oa,[ds]:ds},u=new hi({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new It},radius:{value:4}},vertexShader:aD,fragmentShader:rD}),d=u.clone();d.defines.HORIZONTAL_PASS=1;let v=new bn;v.setAttribute("position",new ui(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let M=new Vt(v,u),_=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Yc;let h=this.type;this.render=function(A,C,g){if(_.enabled===!1||_.autoUpdate===!1&&_.needsUpdate===!1||A.length===0)return;this.type===Wb&&(Dt("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Yc);let b=e.getRenderTarget(),R=e.getActiveCubeFace(),U=e.getActiveMipmapLevel(),I=e.state;I.setBlending(ps),I.buffers.depth.getReversed()===!0?I.buffers.color.setClear(0,0,0,0):I.buffers.color.setClear(1,1,1,1),I.buffers.depth.setTest(!0),I.setScissorTest(!1);let F=h!==this.type;F&&C.traverse(function(D){D.material&&(Array.isArray(D.material)?D.material.forEach(G=>G.needsUpdate=!0):D.material.needsUpdate=!0)});for(let D=0,G=A.length;D<G;D++){let Y=A[D],Z=Y.shadow;if(Z===void 0){Dt("WebGLShadowMap:",Y,"has no shadow.");continue}if(Z.autoUpdate===!1&&Z.needsUpdate===!1)continue;s.copy(Z.mapSize);let it=Z.getFrameExtents();s.multiply(it),a.copy(Z.mapSize),(s.x>f||s.y>f)&&(s.x>f&&(a.x=Math.floor(f/it.x),s.x=a.x*it.x,Z.mapSize.x=a.x),s.y>f&&(a.y=Math.floor(f/it.y),s.y=a.y*it.y,Z.mapSize.y=a.y));let W=e.state.buffers.depth.getReversed();if(Z.camera._reversedDepth=W,Z.map===null||F===!0){if(Z.map!==null&&(Z.map.depthTexture!==null&&(Z.map.depthTexture.dispose(),Z.map.depthTexture=null),Z.map.dispose()),this.type===tl){if(Y.isPointLight){Dt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}Z.map=new Yn(s.x,s.y,{format:za,type:Vi,minFilter:Mn,magFilter:Mn,generateMipmaps:!1}),Z.map.texture.name=Y.name+".shadowMap",Z.map.depthTexture=new Na(s.x,s.y,Hi),Z.map.depthTexture.name=Y.name+".shadowMapDepth",Z.map.depthTexture.format=cs,Z.map.depthTexture.compareFunction=null,Z.map.depthTexture.minFilter=hn,Z.map.depthTexture.magFilter=hn}else Y.isPointLight?(Z.map=new Qd(s.x),Z.map.depthTexture=new Gf(s.x,Fi)):(Z.map=new Yn(s.x,s.y),Z.map.depthTexture=new Na(s.x,s.y,Fi)),Z.map.depthTexture.name=Y.name+".shadowMap",Z.map.depthTexture.format=cs,this.type===Yc?(Z.map.depthTexture.compareFunction=W?Yd:qd,Z.map.depthTexture.minFilter=Mn,Z.map.depthTexture.magFilter=Mn):(Z.map.depthTexture.compareFunction=null,Z.map.depthTexture.minFilter=hn,Z.map.depthTexture.magFilter=hn);Z.camera.updateProjectionMatrix()}Z.map.isWebGLCubeRenderTarget!==!0&&(Z.map.width!==s.x||Z.map.height!==s.y)&&Z.map.setSize(s.x,s.y);let $=Z.map.isWebGLCubeRenderTarget?6:Z.getViewportCount();Y.isPointLight!==!0&&Z.updateMatrices(Y,g);for(let et=0;et<$;et++){let At=Z.getCamera(et);if(Y.isPointLight){let St=Z.camera,ae=Z.matrix,Wt=Y.distance||St.far;Wt!==St.far&&(St.far=Wt,St.updateProjectionMatrix()),iu.setFromMatrixPosition(Y.matrixWorld),St.position.copy(iu),T_.copy(St.position),T_.add(oD[et]),St.up.copy(lD[et]),St.lookAt(T_),St.updateMatrixWorld(),ae.makeTranslation(-iu.x,-iu.y,-iu.z),Q1.multiplyMatrices(St.projectionMatrix,St.matrixWorldInverse),Z._frustum.setFromProjectionMatrix(Q1,St.coordinateSystem,St.reversedDepth)}if(Z.map.isWebGLCubeRenderTarget)e.setRenderTarget(Z.map,et),e.clear();else{et===0&&(e.setRenderTarget(Z.map),e.clear());let St=Z.getViewport(et);r.set(a.x*St.x,a.y*St.y,a.x*St.z,a.y*St.w),I.viewport(r)}i=Z.getFrustum(et),y(C,g,At,Y,this.type)}Z.isPointLightShadow!==!0&&this.type===tl&&m(Z,g),Z.needsUpdate=!1}h=this.type,_.needsUpdate=!1,e.setRenderTarget(b,R,U)};function m(A,C){let g=t.update(M);u.defines.VSM_SAMPLES!==A.blurSamples&&(u.defines.VSM_SAMPLES=A.blurSamples,d.defines.VSM_SAMPLES=A.blurSamples,u.needsUpdate=!0,d.needsUpdate=!0),A.mapPass===null?A.mapPass=new Yn(s.x,s.y,{format:za,type:Vi}):(A.mapPass.width!==A.map.width||A.mapPass.height!==A.map.height)&&A.mapPass.setSize(A.map.width,A.map.height),u.uniforms.shadow_pass.value=A.map.depthTexture,u.uniforms.resolution.value.set(A.map.width,A.map.height),u.uniforms.radius.value=A.radius,e.setRenderTarget(A.mapPass),e.clear(),e.renderBufferDirect(C,null,g,u,M,null),d.uniforms.shadow_pass.value=A.mapPass.texture,d.uniforms.resolution.value.set(A.map.width,A.map.height),d.uniforms.radius.value=A.radius,e.setRenderTarget(A.map),e.clear(),e.renderBufferDirect(C,null,g,d,M,null)}function S(A,C,g,b){let R=null,U=g.isPointLight===!0?A.customDistanceMaterial:A.customDepthMaterial;if(U!==void 0)R=U;else if(R=g.isPointLight===!0?l:o,e.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0||C.alphaToCoverage===!0){let I=R.uuid,F=C.uuid,D=c[I];D===void 0&&(D={},c[I]=D);let G=D[F];G===void 0&&(G=R.clone(),D[F]=G,C.addEventListener("dispose",E)),R=G}if(R.visible=C.visible,R.wireframe=C.wireframe,b===tl?R.side=C.shadowSide!==null?C.shadowSide:C.side:R.side=C.shadowSide!==null?C.shadowSide:p[C.side],R.alphaMap=C.alphaMap,R.alphaTest=C.alphaToCoverage===!0?.5:C.alphaTest,R.map=C.map,R.clipShadows=C.clipShadows,R.clippingPlanes=C.clippingPlanes,R.clipIntersection=C.clipIntersection,R.displacementMap=C.displacementMap,R.displacementScale=C.displacementScale,R.displacementBias=C.displacementBias,R.wireframeLinewidth=C.wireframeLinewidth,R.linewidth=C.linewidth,g.isPointLight===!0&&R.isMeshDistanceMaterial===!0){let I=e.properties.get(R);I.light=g}return R}function y(A,C,g,b,R){if(A.visible===!1)return;if(A.layers.test(C.layers)&&(A.isMesh||A.isLine||A.isPoints)&&(A.castShadow||A.receiveShadow&&R===tl)&&(!A.frustumCulled||A.intersectsFrustum(i))){A.modelViewMatrix.multiplyMatrices(g.matrixWorldInverse,A.matrixWorld);let F=t.update(A),D=A.material;if(Array.isArray(D)){let G=F.groups;for(let Y=0,Z=G.length;Y<Z;Y++){let it=G[Y],W=D[it.materialIndex];if(W&&W.visible){let $=S(A,W,b,R);A.onBeforeShadow(e,A,C,g,F,$,it),e.renderBufferDirect(g,null,F,$,A,it),A.onAfterShadow(e,A,C,g,F,$,it)}}}else if(D.visible){let G=S(A,D,b,R);A.onBeforeShadow(e,A,C,g,F,G,null),e.renderBufferDirect(g,null,F,G,A,null),A.onAfterShadow(e,A,C,g,F,G,null)}}let I=A.children;for(let F=0,D=I.length;F<D;F++)y(I[F],C,g,b,R)}function E(A){A.target.removeEventListener("dispose",E);for(let g in c){let b=c[g],R=A.target.uuid;R in b&&(b[R].dispose(),delete b[R])}}}function uD(e,t){function n(){let O=!1,ut=new ze,K=null,ht=new ze(0,0,0,0);return{setMask:function(gt){K!==gt&&!O&&(e.colorMask(gt,gt,gt,gt),K=gt)},setLocked:function(gt){O=gt},setClear:function(gt,nt,Rt,Et,Ae){Ae===!0&&(gt*=Et,nt*=Et,Rt*=Et),ut.set(gt,nt,Rt,Et),ht.equals(ut)===!1&&(e.clearColor(gt,nt,Rt,Et),ht.copy(ut))},reset:function(){O=!1,K=null,ht.set(-1,0,0,0)}}}function i(){let O=!1,ut=!1,K=null,ht=null,gt=null;return{setReversed:function(nt){if(ut!==nt){let Rt=t.get("EXT_clip_control");nt?Rt.clipControlEXT(Rt.LOWER_LEFT_EXT,Rt.ZERO_TO_ONE_EXT):Rt.clipControlEXT(Rt.LOWER_LEFT_EXT,Rt.NEGATIVE_ONE_TO_ONE_EXT),ut=nt;let Et=gt;gt=null,this.setClear(Et)}},getReversed:function(){return ut},setTest:function(nt){nt?tt(e.DEPTH_TEST):vt(e.DEPTH_TEST)},setMask:function(nt){K!==nt&&!O&&(e.depthMask(nt),K=nt)},setFunc:function(nt){if(ut&&(nt=T1[nt]),ht!==nt){switch(nt){case Mf:e.depthFunc(e.NEVER);break;case bf:e.depthFunc(e.ALWAYS);break;case Ef:e.depthFunc(e.LESS);break;case ko:e.depthFunc(e.LEQUAL);break;case Tf:e.depthFunc(e.EQUAL);break;case Af:e.depthFunc(e.GEQUAL);break;case wf:e.depthFunc(e.GREATER);break;case Cf:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}ht=nt}},setLocked:function(nt){O=nt},setClear:function(nt){gt!==nt&&(gt=nt,ut&&(nt=1-nt),e.clearDepth(nt))},reset:function(){O=!1,K=null,ht=null,gt=null,ut=!1}}}function s(){let O=!1,ut=null,K=null,ht=null,gt=null,nt=null,Rt=null,Et=null,Ae=null;return{setTest:function(ue){O||(ue?tt(e.STENCIL_TEST):vt(e.STENCIL_TEST))},setMask:function(ue){ut!==ue&&!O&&(e.stencilMask(ue),ut=ue)},setFunc:function(ue,Ai,ki){(K!==ue||ht!==Ai||gt!==ki)&&(e.stencilFunc(ue,Ai,ki),K=ue,ht=Ai,gt=ki)},setOp:function(ue,Ai,ki){(nt!==ue||Rt!==Ai||Et!==ki)&&(e.stencilOp(ue,Ai,ki),nt=ue,Rt=Ai,Et=ki)},setLocked:function(ue){O=ue},setClear:function(ue){Ae!==ue&&(e.clearStencil(ue),Ae=ue)},reset:function(){O=!1,ut=null,K=null,ht=null,gt=null,nt=null,Rt=null,Et=null,Ae=null}}}let a=new n,r=new i,o=new s,l=new WeakMap,c=new WeakMap,f={},p={},u={},d=new WeakMap,v=[],M=null,_=!1,h=null,m=null,S=null,y=null,E=null,A=null,C=null,g=new Ht(0,0,0),b=0,R=!1,U=null,I=null,F=null,D=null,G=null,Y=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),Z=!1,it=0,W=e.getParameter(e.VERSION);W.indexOf("WebGL")!==-1?(it=parseFloat(/^WebGL (\d)/.exec(W)[1]),Z=it>=1):W.indexOf("OpenGL ES")!==-1&&(it=parseFloat(/^OpenGL ES (\d)/.exec(W)[1]),Z=it>=2);let $=null,et={},At=e.getParameter(e.SCISSOR_BOX),St=e.getParameter(e.VIEWPORT),ae=new ze().fromArray(At),Wt=new ze().fromArray(St);function ne(O,ut,K,ht){let gt=new Uint8Array(4),nt=e.createTexture();e.bindTexture(O,nt),e.texParameteri(O,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(O,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let Rt=0;Rt<K;Rt++)O===e.TEXTURE_3D||O===e.TEXTURE_2D_ARRAY?e.texImage3D(ut,0,e.RGBA,1,1,ht,0,e.RGBA,e.UNSIGNED_BYTE,gt):e.texImage2D(ut+Rt,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,gt);return nt}let q={};q[e.TEXTURE_2D]=ne(e.TEXTURE_2D,e.TEXTURE_2D,1),q[e.TEXTURE_CUBE_MAP]=ne(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),q[e.TEXTURE_2D_ARRAY]=ne(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),q[e.TEXTURE_3D]=ne(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),r.setClear(1),o.setClear(0),tt(e.DEPTH_TEST),r.setFunc(ko),Yt(!1),_e(V0),tt(e.CULL_FACE),ie(ps);function tt(O){f[O]!==!0&&(e.enable(O),f[O]=!0)}function vt(O){f[O]!==!1&&(e.disable(O),f[O]=!1)}function Ot(O,ut){return u[O]!==ut?(e.bindFramebuffer(O,ut),u[O]=ut,O===e.DRAW_FRAMEBUFFER&&(u[e.FRAMEBUFFER]=ut),O===e.FRAMEBUFFER&&(u[e.DRAW_FRAMEBUFFER]=ut),!0):!1}function _t(O,ut){let K=v,ht=!1;if(O){K=d.get(ut),K===void 0&&(K=[],d.set(ut,K));let gt=O.textures;if(K.length!==gt.length||K[0]!==e.COLOR_ATTACHMENT0){for(let nt=0,Rt=gt.length;nt<Rt;nt++)K[nt]=e.COLOR_ATTACHMENT0+nt;K.length=gt.length,ht=!0}}else K[0]!==e.BACK&&(K[0]=e.BACK,ht=!0);ht&&e.drawBuffers(K)}function Gt(O){return M!==O?(e.useProgram(O),M=O,!0):!1}let Ge={[yr]:e.FUNC_ADD,[Yb]:e.FUNC_SUBTRACT,[Zb]:e.FUNC_REVERSE_SUBTRACT};Ge[Jb]=e.MIN,Ge[Kb]=e.MAX;let qt={[Qb]:e.ZERO,[jb]:e.ONE,[$b]:e.SRC_COLOR,[W0]:e.SRC_ALPHA,[a1]:e.SRC_ALPHA_SATURATE,[i1]:e.DST_COLOR,[e1]:e.DST_ALPHA,[t1]:e.ONE_MINUS_SRC_COLOR,[q0]:e.ONE_MINUS_SRC_ALPHA,[s1]:e.ONE_MINUS_DST_COLOR,[n1]:e.ONE_MINUS_DST_ALPHA,[r1]:e.CONSTANT_COLOR,[o1]:e.ONE_MINUS_CONSTANT_COLOR,[l1]:e.CONSTANT_ALPHA,[c1]:e.ONE_MINUS_CONSTANT_ALPHA};function ie(O,ut,K,ht,gt,nt,Rt,Et,Ae,ue){if(O===ps){_===!0&&(vt(e.BLEND),_=!1);return}if(_===!1&&(tt(e.BLEND),_=!0),O!==qb){if(O!==h||ue!==R){if((m!==yr||E!==yr)&&(e.blendEquation(e.FUNC_ADD),m=yr,E=yr),ue)switch(O){case el:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case G0:e.blendFunc(e.ONE,e.ONE);break;case k0:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case X0:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:Ut("WebGLState: Invalid blending: ",O);break}else switch(O){case el:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case G0:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case k0:Ut("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case X0:Ut("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ut("WebGLState: Invalid blending: ",O);break}S=null,y=null,A=null,C=null,g.set(0,0,0),b=0,h=O,R=ue}return}gt=gt||ut,nt=nt||K,Rt=Rt||ht,(ut!==m||gt!==E)&&(e.blendEquationSeparate(Ge[ut],Ge[gt]),m=ut,E=gt),(K!==S||ht!==y||nt!==A||Rt!==C)&&(e.blendFuncSeparate(qt[K],qt[ht],qt[nt],qt[Rt]),S=K,y=ht,A=nt,C=Rt),(Et.equals(g)===!1||Ae!==b)&&(e.blendColor(Et.r,Et.g,Et.b,Ae),g.copy(Et),b=Ae),h=O,R=!1}function oe(O,ut){O.side===ds?vt(e.CULL_FACE):tt(e.CULL_FACE);let K=O.side===Fn;ut&&(K=!K),Yt(K),O.blending===el&&O.transparent===!1?ie(ps):ie(O.blending,O.blendEquation,O.blendSrc,O.blendDst,O.blendEquationAlpha,O.blendSrcAlpha,O.blendDstAlpha,O.blendColor,O.blendAlpha,O.premultipliedAlpha),r.setFunc(O.depthFunc),r.setTest(O.depthTest),r.setMask(O.depthWrite),a.setMask(O.colorWrite);let ht=O.stencilWrite;o.setTest(ht),ht&&(o.setMask(O.stencilWriteMask),o.setFunc(O.stencilFunc,O.stencilRef,O.stencilFuncMask),o.setOp(O.stencilFail,O.stencilZFail,O.stencilZPass)),an(O.polygonOffset,O.polygonOffsetFactor,O.polygonOffsetUnits),O.alphaToCoverage===!0?tt(e.SAMPLE_ALPHA_TO_COVERAGE):vt(e.SAMPLE_ALPHA_TO_COVERAGE)}function Yt(O){U!==O&&(O?e.frontFace(e.CW):e.frontFace(e.CCW),U=O)}function _e(O){O!==kb?(tt(e.CULL_FACE),O!==I&&(O===V0?e.cullFace(e.BACK):O===Xb?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):vt(e.CULL_FACE),I=O}function ke(O){O!==F&&(Z&&e.lineWidth(O),F=O)}function an(O,ut,K){O?(tt(e.POLYGON_OFFSET_FILL),(D!==ut||G!==K)&&(D=ut,G=K,r.getReversed()&&(ut=-ut),e.polygonOffset(ut,K))):vt(e.POLYGON_OFFSET_FILL)}function Te(O){O?tt(e.SCISSOR_TEST):vt(e.SCISSOR_TEST)}function st(O){O===void 0&&(O=e.TEXTURE0+Y-1),$!==O&&(e.activeTexture(O),$=O)}function N(O,ut,K){K===void 0&&($===null?K=e.TEXTURE0+Y-1:K=$);let ht=et[K];ht===void 0&&(ht={type:void 0,texture:void 0},et[K]=ht),(ht.type!==O||ht.texture!==ut)&&($!==K&&(e.activeTexture(K),$=K),e.bindTexture(O,ut||q[O]),ht.type=O,ht.texture=ut)}function jt(){let O=et[$];O!==void 0&&O.type!==void 0&&(e.bindTexture(O.type,null),O.type=void 0,O.texture=void 0)}function rt(){try{e.compressedTexImage2D(...arguments)}catch(O){Ut("WebGLState:",O)}}function w(){try{e.compressedTexImage3D(...arguments)}catch(O){Ut("WebGLState:",O)}}function x(){try{e.texSubImage2D(...arguments)}catch(O){Ut("WebGLState:",O)}}function P(){try{e.texSubImage3D(...arguments)}catch(O){Ut("WebGLState:",O)}}function z(){try{e.compressedTexSubImage2D(...arguments)}catch(O){Ut("WebGLState:",O)}}function k(){try{e.compressedTexSubImage3D(...arguments)}catch(O){Ut("WebGLState:",O)}}function at(){try{e.texStorage2D(...arguments)}catch(O){Ut("WebGLState:",O)}}function ot(){try{e.texStorage3D(...arguments)}catch(O){Ut("WebGLState:",O)}}function J(){try{e.texImage2D(...arguments)}catch(O){Ut("WebGLState:",O)}}function j(){try{e.texImage3D(...arguments)}catch(O){Ut("WebGLState:",O)}}function lt(O){return p[O]!==void 0?p[O]:e.getParameter(O)}function wt(O,ut){p[O]!==ut&&(e.pixelStorei(O,ut),p[O]=ut)}function ft(O){ae.equals(O)===!1&&(e.scissor(O.x,O.y,O.z,O.w),ae.copy(O))}function ct(O){Wt.equals(O)===!1&&(e.viewport(O.x,O.y,O.z,O.w),Wt.copy(O))}function Ct(O,ut){let K=c.get(ut);K===void 0&&(K=new WeakMap,c.set(ut,K));let ht=K.get(O);ht===void 0&&(ht=e.getUniformBlockIndex(ut,O.name),K.set(O,ht))}function Nt(O,ut){let ht=c.get(ut).get(O);l.get(ut)!==ht&&(e.uniformBlockBinding(ut,ht,O.__bindingPointIndex),l.set(ut,ht))}function zt(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),r.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),f={},p={},$=null,et={},u={},d=new WeakMap,v=[],M=null,_=!1,h=null,m=null,S=null,y=null,E=null,A=null,C=null,g=new Ht(0,0,0),b=0,R=!1,U=null,I=null,F=null,D=null,G=null,ae.set(0,0,e.canvas.width,e.canvas.height),Wt.set(0,0,e.canvas.width,e.canvas.height),a.reset(),r.reset(),o.reset()}return{buffers:{color:a,depth:r,stencil:o},enable:tt,disable:vt,bindFramebuffer:Ot,drawBuffers:_t,useProgram:Gt,setBlending:ie,setMaterial:oe,setFlipSided:Yt,setCullFace:_e,setLineWidth:ke,setPolygonOffset:an,setScissorTest:Te,activeTexture:st,bindTexture:N,unbindTexture:jt,compressedTexImage2D:rt,compressedTexImage3D:w,texImage2D:J,texImage3D:j,pixelStorei:wt,getParameter:lt,updateUBOMapping:Ct,uniformBlockBinding:Nt,texStorage2D:at,texStorage3D:ot,texSubImage2D:x,texSubImage3D:P,compressedTexSubImage2D:z,compressedTexSubImage3D:k,scissor:ft,viewport:ct,reset:zt}}function hD(e,t,n,i,s,a,r){let o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new It,f=new WeakMap,p=new Set,u,d=new WeakMap,v=!1;try{v=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function M(w,x){return v?new OffscreenCanvas(w,x):Sc("canvas")}function _(w,x,P){let z=1,k=rt(w);if((k.width>P||k.height>P)&&(z=P/Math.max(k.width,k.height)),z<1)if(typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&w instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&w instanceof ImageBitmap||typeof VideoFrame<"u"&&w instanceof VideoFrame){let at=Math.floor(z*k.width),ot=Math.floor(z*k.height);u===void 0&&(u=M(at,ot));let J=x?M(at,ot):u;return J.width=at,J.height=ot,J.getContext("2d").drawImage(w,0,0,at,ot),Dt("WebGLRenderer: Texture has been resized from ("+k.width+"x"+k.height+") to ("+at+"x"+ot+")."),J}else return"data"in w&&Dt("WebGLRenderer: Image in DataTexture is too big ("+k.width+"x"+k.height+")."),w;return w}function h(w){return w.generateMipmaps}function m(w){e.generateMipmap(w)}function S(w){return w.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:w.isWebGL3DRenderTarget?e.TEXTURE_3D:w.isWebGLArrayRenderTarget||w.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function y(w,x,P,z,k,at=!1){if(w!==null){if(e[w]!==void 0)return e[w];Dt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+w+"'")}let ot;z&&(ot=t.get("EXT_texture_norm16"),ot||Dt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let J=x;if(x===e.RED&&(P===e.FLOAT&&(J=e.R32F),P===e.HALF_FLOAT&&(J=e.R16F),P===e.UNSIGNED_BYTE&&(J=e.R8),P===e.UNSIGNED_SHORT&&ot&&(J=ot.R16_EXT),P===e.SHORT&&ot&&(J=ot.R16_SNORM_EXT)),x===e.RED_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.R8UI),P===e.UNSIGNED_SHORT&&(J=e.R16UI),P===e.UNSIGNED_INT&&(J=e.R32UI),P===e.BYTE&&(J=e.R8I),P===e.SHORT&&(J=e.R16I),P===e.INT&&(J=e.R32I)),x===e.RG&&(P===e.FLOAT&&(J=e.RG32F),P===e.HALF_FLOAT&&(J=e.RG16F),P===e.UNSIGNED_BYTE&&(J=e.RG8),P===e.UNSIGNED_SHORT&&ot&&(J=ot.RG16_EXT),P===e.SHORT&&ot&&(J=ot.RG16_SNORM_EXT)),x===e.RG_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RG8UI),P===e.UNSIGNED_SHORT&&(J=e.RG16UI),P===e.UNSIGNED_INT&&(J=e.RG32UI),P===e.BYTE&&(J=e.RG8I),P===e.SHORT&&(J=e.RG16I),P===e.INT&&(J=e.RG32I)),x===e.RGB_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RGB8UI),P===e.UNSIGNED_SHORT&&(J=e.RGB16UI),P===e.UNSIGNED_INT&&(J=e.RGB32UI),P===e.BYTE&&(J=e.RGB8I),P===e.SHORT&&(J=e.RGB16I),P===e.INT&&(J=e.RGB32I)),x===e.RGBA_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RGBA8UI),P===e.UNSIGNED_SHORT&&(J=e.RGBA16UI),P===e.UNSIGNED_INT&&(J=e.RGBA32UI),P===e.BYTE&&(J=e.RGBA8I),P===e.SHORT&&(J=e.RGBA16I),P===e.INT&&(J=e.RGBA32I)),x===e.RGB&&(P===e.UNSIGNED_SHORT&&ot&&(J=ot.RGB16_EXT),P===e.SHORT&&ot&&(J=ot.RGB16_SNORM_EXT),P===e.UNSIGNED_INT_5_9_9_9_REV&&(J=e.RGB9_E5),P===e.UNSIGNED_INT_10F_11F_11F_REV&&(J=e.R11F_G11F_B10F)),x===e.RGBA){let j=at?xc:te.getTransfer(k);P===e.FLOAT&&(J=e.RGBA32F),P===e.HALF_FLOAT&&(J=e.RGBA16F),P===e.UNSIGNED_BYTE&&(J=j===de?e.SRGB8_ALPHA8:e.RGBA8),P===e.UNSIGNED_SHORT&&ot&&(J=ot.RGBA16_EXT),P===e.SHORT&&ot&&(J=ot.RGBA16_SNORM_EXT),P===e.UNSIGNED_SHORT_4_4_4_4&&(J=e.RGBA4),P===e.UNSIGNED_SHORT_5_5_5_1&&(J=e.RGB5_A1)}return(J===e.R16F||J===e.R32F||J===e.RG16F||J===e.RG32F||J===e.RGBA16F||J===e.RGBA32F)&&t.get("EXT_color_buffer_float"),J}function E(w,x){let P;return w?x===null||x===Fi||x===il?P=e.DEPTH24_STENCIL8:x===Hi?P=e.DEPTH32F_STENCIL8:x===nl&&(P=e.DEPTH24_STENCIL8,Dt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===Fi||x===il?P=e.DEPTH_COMPONENT24:x===Hi?P=e.DEPTH_COMPONENT32F:x===nl&&(P=e.DEPTH_COMPONENT16),P}function A(w,x){return h(w)===!0||w.isFramebufferTexture&&w.minFilter!==hn&&w.minFilter!==Mn?Math.log2(Math.max(x.width,x.height))+1:w.mipmaps!==void 0&&w.mipmaps.length>0?w.mipmaps.length:w.isCompressedTexture&&Array.isArray(w.image)?x.mipmaps.length:1}function C(w){let x=w.target;x.removeEventListener("dispose",C),b(x),x.isVideoTexture&&f.delete(x),x.isHTMLTexture&&p.delete(x)}function g(w){let x=w.target;x.removeEventListener("dispose",g),U(x)}function b(w){let x=i.get(w);if(x.__webglInit===void 0)return;let P=w.source,z=d.get(P);if(z){let k=z[x.__cacheKey];k.usedTimes--,k.usedTimes===0&&R(w),Object.keys(z).length===0&&d.delete(P)}i.remove(w)}function R(w){let x=i.get(w);e.deleteTexture(x.__webglTexture);let P=w.source,z=d.get(P);delete z[x.__cacheKey],r.memory.textures--}function U(w){let x=i.get(w);if(w.depthTexture&&(w.depthTexture.dispose(),i.remove(w.depthTexture)),w.isWebGLCubeRenderTarget)for(let z=0;z<6;z++){if(Array.isArray(x.__webglFramebuffer[z]))for(let k=0;k<x.__webglFramebuffer[z].length;k++)e.deleteFramebuffer(x.__webglFramebuffer[z][k]);else e.deleteFramebuffer(x.__webglFramebuffer[z]);x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer[z])}else{if(Array.isArray(x.__webglFramebuffer))for(let z=0;z<x.__webglFramebuffer.length;z++)e.deleteFramebuffer(x.__webglFramebuffer[z]);else e.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&e.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let z=0;z<x.__webglColorRenderbuffer.length;z++)x.__webglColorRenderbuffer[z]&&e.deleteRenderbuffer(x.__webglColorRenderbuffer[z]);x.__webglDepthRenderbuffer&&e.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let P=w.textures;for(let z=0,k=P.length;z<k;z++){let at=i.get(P[z]);at.__webglTexture&&(e.deleteTexture(at.__webglTexture),r.memory.textures--),i.remove(P[z])}i.remove(w)}let I=0;function F(){I=0}function D(){return I}function G(w){I=w}function Y(){let w=I;return w>=s.maxTextures&&Dt("WebGLTextures: Trying to use "+(w+1)+" texture units while this GPU supports only "+s.maxTextures),I+=1,w}function Z(w){let x=[];return x.push(w.wrapS),x.push(w.wrapT),x.push(w.wrapR||0),x.push(w.magFilter),x.push(w.minFilter),x.push(w.anisotropy),x.push(w.internalFormat),x.push(w.format),x.push(w.type),x.push(w.generateMipmaps),x.push(w.premultiplyAlpha),x.push(w.flipY),x.push(w.unpackAlignment),x.push(w.colorSpace),x.join()}function it(w,x){let P=i.get(w);if(w.isVideoTexture&&N(w),w.isRenderTargetTexture===!1&&w.isExternalTexture!==!0&&w.version>0&&P.__version!==w.version){let z=w.image;if(z===null)Dt("WebGLRenderer: Texture marked for update but no image data found.");else if(z.complete===!1)Dt("WebGLRenderer: Texture marked for update but image is incomplete");else{vt(P,w,x);return}}else w.isExternalTexture&&(P.__webglTexture=w.sourceTexture?w.sourceTexture:null);n.bindTexture(e.TEXTURE_2D,P.__webglTexture,e.TEXTURE0+x)}function W(w,x){let P=i.get(w);if(w.isRenderTargetTexture===!1&&w.version>0&&P.__version!==w.version){vt(P,w,x);return}else w.isExternalTexture&&(P.__webglTexture=w.sourceTexture?w.sourceTexture:null);n.bindTexture(e.TEXTURE_2D_ARRAY,P.__webglTexture,e.TEXTURE0+x)}function $(w,x){let P=i.get(w);if(w.isRenderTargetTexture===!1&&w.version>0&&P.__version!==w.version){vt(P,w,x);return}n.bindTexture(e.TEXTURE_3D,P.__webglTexture,e.TEXTURE0+x)}function et(w,x){let P=i.get(w);if(w.isCubeDepthTexture!==!0&&w.version>0&&P.__version!==w.version){Ot(P,w,x);return}n.bindTexture(e.TEXTURE_CUBE_MAP,P.__webglTexture,e.TEXTURE0+x)}let At={[Rf]:e.REPEAT,[ls]:e.CLAMP_TO_EDGE,[Nf]:e.MIRRORED_REPEAT},St={[hn]:e.NEAREST,[f1]:e.NEAREST_MIPMAP_NEAREST,[Jc]:e.NEAREST_MIPMAP_LINEAR,[Mn]:e.LINEAR,[ld]:e.LINEAR_MIPMAP_NEAREST,[Pa]:e.LINEAR_MIPMAP_LINEAR},ae={[g1]:e.NEVER,[S1]:e.ALWAYS,[_1]:e.LESS,[qd]:e.LEQUAL,[v1]:e.EQUAL,[Yd]:e.GEQUAL,[y1]:e.GREATER,[x1]:e.NOTEQUAL};function Wt(w,x){if(x.type===Hi&&t.has("OES_texture_float_linear")===!1&&(x.magFilter===Mn||x.magFilter===ld||x.magFilter===Jc||x.magFilter===Pa||x.minFilter===Mn||x.minFilter===ld||x.minFilter===Jc||x.minFilter===Pa)&&Dt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(w,e.TEXTURE_WRAP_S,At[x.wrapS]),e.texParameteri(w,e.TEXTURE_WRAP_T,At[x.wrapT]),(w===e.TEXTURE_3D||w===e.TEXTURE_2D_ARRAY)&&e.texParameteri(w,e.TEXTURE_WRAP_R,At[x.wrapR]),e.texParameteri(w,e.TEXTURE_MAG_FILTER,St[x.magFilter]),e.texParameteri(w,e.TEXTURE_MIN_FILTER,St[x.minFilter]),x.compareFunction&&(e.texParameteri(w,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(w,e.TEXTURE_COMPARE_FUNC,ae[x.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===hn||x.minFilter!==Jc&&x.minFilter!==Pa||x.type===Hi&&t.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||i.get(x).__currentAnisotropy){let P=t.get("EXT_texture_filter_anisotropic");e.texParameterf(w,P.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),i.get(x).__currentAnisotropy=x.anisotropy}}}function ne(w,x){let P=!1;w.__webglInit===void 0&&(w.__webglInit=!0,x.addEventListener("dispose",C));let z=x.source,k=d.get(z);k===void 0&&(k={},d.set(z,k));let at=Z(x);if(at!==w.__cacheKey){k[at]===void 0&&(k[at]={texture:e.createTexture(),usedTimes:0},r.memory.textures++,P=!0),k[at].usedTimes++;let ot=k[w.__cacheKey];ot!==void 0&&(k[w.__cacheKey].usedTimes--,ot.usedTimes===0&&R(x)),w.__cacheKey=at,w.__webglTexture=k[at].texture}return P}function q(w,x,P){return Math.floor(Math.floor(w/P)/x)}function tt(w,x,P,z){let at=w.updateRanges;if(at.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,x.width,x.height,P,z,x.data);else{at.sort((wt,ft)=>wt.start-ft.start);let ot=0;for(let wt=1;wt<at.length;wt++){let ft=at[ot],ct=at[wt],Ct=ft.start+ft.count,Nt=q(ct.start,x.width,4),zt=q(ft.start,x.width,4);ct.start<=Ct+1&&Nt===zt&&q(ct.start+ct.count-1,x.width,4)===Nt?ft.count=Math.max(ft.count,ct.start+ct.count-ft.start):(++ot,at[ot]=ct)}at.length=ot+1;let J=n.getParameter(e.UNPACK_ROW_LENGTH),j=n.getParameter(e.UNPACK_SKIP_PIXELS),lt=n.getParameter(e.UNPACK_SKIP_ROWS);n.pixelStorei(e.UNPACK_ROW_LENGTH,x.width);for(let wt=0,ft=at.length;wt<ft;wt++){let ct=at[wt],Ct=Math.floor(ct.start/4),Nt=Math.ceil(ct.count/4),zt=Ct%x.width,O=Math.floor(Ct/x.width),ut=Nt,K=1;n.pixelStorei(e.UNPACK_SKIP_PIXELS,zt),n.pixelStorei(e.UNPACK_SKIP_ROWS,O),n.texSubImage2D(e.TEXTURE_2D,0,zt,O,ut,K,P,z,x.data)}w.clearUpdateRanges(),n.pixelStorei(e.UNPACK_ROW_LENGTH,J),n.pixelStorei(e.UNPACK_SKIP_PIXELS,j),n.pixelStorei(e.UNPACK_SKIP_ROWS,lt)}}function vt(w,x,P){let z=e.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(z=e.TEXTURE_2D_ARRAY),x.isData3DTexture&&(z=e.TEXTURE_3D);let k=ne(w,x),at=x.source;n.bindTexture(z,w.__webglTexture,e.TEXTURE0+P);let ot=i.get(at);if(at.version!==ot.__version||k===!0){if(n.activeTexture(e.TEXTURE0+P),(typeof ImageBitmap<"u"&&x.image instanceof ImageBitmap)===!1){let K=te.getPrimaries(te.workingColorSpace),ht=x.colorSpace===Vs?null:te.getPrimaries(x.colorSpace),gt=x.colorSpace===Vs||K===ht?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,x.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,gt)}n.pixelStorei(e.UNPACK_ALIGNMENT,x.unpackAlignment);let j=_(x.image,!1,s.maxTextureSize);j=jt(x,j);let lt=a.convert(x.format,x.colorSpace),wt=a.convert(x.type),ft=y(x.internalFormat,lt,wt,x.normalized,x.colorSpace,x.isVideoTexture);Wt(z,x);let ct,Ct=x.mipmaps,Nt=x.isVideoTexture!==!0,zt=ot.__version===void 0||k===!0,O=at.dataReady,ut=A(x,j);if(x.isDepthTexture)ft=E(x.format===Ba,x.type),zt&&(Nt?n.texStorage2D(e.TEXTURE_2D,1,ft,j.width,j.height):n.texImage2D(e.TEXTURE_2D,0,ft,j.width,j.height,0,lt,wt,null));else if(x.isDataTexture)if(Ct.length>0){Nt&&zt&&n.texStorage2D(e.TEXTURE_2D,ut,ft,Ct[0].width,Ct[0].height);for(let K=0,ht=Ct.length;K<ht;K++)ct=Ct[K],Nt?O&&n.texSubImage2D(e.TEXTURE_2D,K,0,0,ct.width,ct.height,lt,wt,ct.data):n.texImage2D(e.TEXTURE_2D,K,ft,ct.width,ct.height,0,lt,wt,ct.data);x.generateMipmaps=!1}else Nt?(zt&&n.texStorage2D(e.TEXTURE_2D,ut,ft,j.width,j.height),O&&tt(x,j,lt,wt)):n.texImage2D(e.TEXTURE_2D,0,ft,j.width,j.height,0,lt,wt,j.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){Nt&&zt&&n.texStorage3D(e.TEXTURE_2D_ARRAY,ut,ft,Ct[0].width,Ct[0].height,j.depth);for(let K=0,ht=Ct.length;K<ht;K++)if(ct=Ct[K],x.format!==Ti)if(lt!==null)if(Nt){if(O)if(x.layerUpdates.size>0){let gt=p_(ct.width,ct.height,x.format,x.type);for(let nt of x.layerUpdates){let Rt=ct.data.subarray(nt*gt/ct.data.BYTES_PER_ELEMENT,(nt+1)*gt/ct.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,K,0,0,nt,ct.width,ct.height,1,lt,Rt)}}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,K,0,0,0,ct.width,ct.height,j.depth,lt,ct.data)}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,K,ft,ct.width,ct.height,j.depth,0,ct.data,0,0);else Dt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Nt?O&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,K,0,0,0,ct.width,ct.height,j.depth,lt,wt,ct.data):n.texImage3D(e.TEXTURE_2D_ARRAY,K,ft,ct.width,ct.height,j.depth,0,lt,wt,ct.data);x.layerUpdates.size>0&&x.clearLayerUpdates()}else{Nt&&zt&&n.texStorage2D(e.TEXTURE_2D,ut,ft,Ct[0].width,Ct[0].height);for(let K=0,ht=Ct.length;K<ht;K++)ct=Ct[K],x.format!==Ti?lt!==null?Nt?O&&n.compressedTexSubImage2D(e.TEXTURE_2D,K,0,0,ct.width,ct.height,lt,ct.data):n.compressedTexImage2D(e.TEXTURE_2D,K,ft,ct.width,ct.height,0,ct.data):Dt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Nt?O&&n.texSubImage2D(e.TEXTURE_2D,K,0,0,ct.width,ct.height,lt,wt,ct.data):n.texImage2D(e.TEXTURE_2D,K,ft,ct.width,ct.height,0,lt,wt,ct.data)}else if(x.isDataArrayTexture)if(Nt){if(zt&&n.texStorage3D(e.TEXTURE_2D_ARRAY,ut,ft,j.width,j.height,j.depth),O)if(x.layerUpdates.size>0){let K=p_(j.width,j.height,x.format,x.type);for(let ht of x.layerUpdates){let gt=j.data.subarray(ht*K/j.data.BYTES_PER_ELEMENT,(ht+1)*K/j.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,ht,j.width,j.height,1,lt,wt,gt)}x.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,j.width,j.height,j.depth,lt,wt,j.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,ft,j.width,j.height,j.depth,0,lt,wt,j.data);else if(x.isData3DTexture)Nt?(zt&&n.texStorage3D(e.TEXTURE_3D,ut,ft,j.width,j.height,j.depth),O&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,j.width,j.height,j.depth,lt,wt,j.data)):n.texImage3D(e.TEXTURE_3D,0,ft,j.width,j.height,j.depth,0,lt,wt,j.data);else if(x.isFramebufferTexture){if(zt)if(Nt)n.texStorage2D(e.TEXTURE_2D,ut,ft,j.width,j.height);else{let K=j.width,ht=j.height;for(let gt=0;gt<ut;gt++)n.texImage2D(e.TEXTURE_2D,gt,ft,K,ht,0,lt,wt,null),K>>=1,ht>>=1}}else if(x.isHTMLTexture){if("texElementImage2D"in e){let K=e.canvas;if(K.hasAttribute("layoutsubtree")||K.setAttribute("layoutsubtree","true"),j.parentNode!==K){K.appendChild(j),p.add(x),K.onpaint=ht=>{let gt=ht.changedElements;for(let nt of p)gt.includes(nt.image)&&(nt.needsUpdate=!0)},K.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,j);else{let gt=e.RGBA,nt=e.RGBA,Rt=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,gt,nt,Rt,j)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(Ct.length>0){if(Nt&&zt){let K=rt(Ct[0]);n.texStorage2D(e.TEXTURE_2D,ut,ft,K.width,K.height)}for(let K=0,ht=Ct.length;K<ht;K++)ct=Ct[K],Nt?O&&n.texSubImage2D(e.TEXTURE_2D,K,0,0,lt,wt,ct):n.texImage2D(e.TEXTURE_2D,K,ft,lt,wt,ct);x.generateMipmaps=!1}else if(Nt){if(zt){let K=rt(j);n.texStorage2D(e.TEXTURE_2D,ut,ft,K.width,K.height)}O&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,lt,wt,j)}else n.texImage2D(e.TEXTURE_2D,0,ft,lt,wt,j);h(x)&&m(z),ot.__version=at.version,x.onUpdate&&x.onUpdate(x)}w.__version=x.version}function Ot(w,x,P){if(x.image.length!==6)return;let z=ne(w,x),k=x.source;n.bindTexture(e.TEXTURE_CUBE_MAP,w.__webglTexture,e.TEXTURE0+P);let at=i.get(k);if(k.version!==at.__version||z===!0){n.activeTexture(e.TEXTURE0+P);let ot=te.getPrimaries(te.workingColorSpace),J=x.colorSpace===Vs?null:te.getPrimaries(x.colorSpace),j=x.colorSpace===Vs||ot===J?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,x.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),n.pixelStorei(e.UNPACK_ALIGNMENT,x.unpackAlignment),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,j);let lt=x.isCompressedTexture||x.image[0].isCompressedTexture,wt=x.image[0]&&x.image[0].isDataTexture,ft=[];for(let nt=0;nt<6;nt++)!lt&&!wt?ft[nt]=_(x.image[nt],!0,s.maxCubemapSize):ft[nt]=wt?x.image[nt].image:x.image[nt],ft[nt]=jt(x,ft[nt]);let ct=ft[0],Ct=a.convert(x.format,x.colorSpace),Nt=a.convert(x.type),zt=y(x.internalFormat,Ct,Nt,x.normalized,x.colorSpace),O=x.isVideoTexture!==!0,ut=at.__version===void 0||z===!0,K=k.dataReady,ht=A(x,ct);Wt(e.TEXTURE_CUBE_MAP,x);let gt;if(lt){O&&ut&&n.texStorage2D(e.TEXTURE_CUBE_MAP,ht,zt,ct.width,ct.height);for(let nt=0;nt<6;nt++){gt=ft[nt].mipmaps;for(let Rt=0;Rt<gt.length;Rt++){let Et=gt[Rt];x.format!==Ti?Ct!==null?O?K&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt,0,0,Et.width,Et.height,Ct,Et.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt,zt,Et.width,Et.height,0,Et.data):Dt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):O?K&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt,0,0,Et.width,Et.height,Ct,Nt,Et.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt,zt,Et.width,Et.height,0,Ct,Nt,Et.data)}}}else{if(gt=x.mipmaps,O&&ut){gt.length>0&&ht++;let nt=rt(ft[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,ht,zt,nt.width,nt.height)}for(let nt=0;nt<6;nt++)if(wt){O?K&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,0,0,0,ft[nt].width,ft[nt].height,Ct,Nt,ft[nt].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,0,zt,ft[nt].width,ft[nt].height,0,Ct,Nt,ft[nt].data);for(let Rt=0;Rt<gt.length;Rt++){let Ae=gt[Rt].image[nt].image;O?K&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt+1,0,0,Ae.width,Ae.height,Ct,Nt,Ae.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt+1,zt,Ae.width,Ae.height,0,Ct,Nt,Ae.data)}}else{O?K&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,0,0,0,Ct,Nt,ft[nt]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,0,zt,Ct,Nt,ft[nt]);for(let Rt=0;Rt<gt.length;Rt++){let Et=gt[Rt];O?K&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt+1,0,0,Ct,Nt,Et.image[nt]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+nt,Rt+1,zt,Ct,Nt,Et.image[nt])}}}h(x)&&m(e.TEXTURE_CUBE_MAP),at.__version=k.version,x.onUpdate&&x.onUpdate(x)}w.__version=x.version}function _t(w,x,P,z,k,at){let ot=a.convert(P.format,P.colorSpace),J=a.convert(P.type),j=y(P.internalFormat,ot,J,P.normalized,P.colorSpace),lt=i.get(x),wt=i.get(P);if(wt.__renderTarget=x,!lt.__hasExternalTextures){let ft=Math.max(1,x.width>>at),ct=Math.max(1,x.height>>at);k===e.TEXTURE_3D||k===e.TEXTURE_2D_ARRAY?n.texImage3D(k,at,j,ft,ct,x.depth,0,ot,J,null):n.texImage2D(k,at,j,ft,ct,0,ot,J,null)}n.bindFramebuffer(e.FRAMEBUFFER,w),st(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,z,k,wt.__webglTexture,0,Te(x)):(k===e.TEXTURE_2D||k>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&k<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,z,k,wt.__webglTexture,at),n.bindFramebuffer(e.FRAMEBUFFER,null)}function Gt(w,x,P){if(e.bindRenderbuffer(e.RENDERBUFFER,w),x.depthBuffer){let z=x.depthTexture,k=z&&z.isDepthTexture?z.type:null,at=E(x.stencilBuffer,k),ot=x.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;st(x)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Te(x),at,x.width,x.height):P?e.renderbufferStorageMultisample(e.RENDERBUFFER,Te(x),at,x.width,x.height):e.renderbufferStorage(e.RENDERBUFFER,at,x.width,x.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,ot,e.RENDERBUFFER,w)}else{let z=x.textures;for(let k=0;k<z.length;k++){let at=z[k],ot=a.convert(at.format,at.colorSpace),J=a.convert(at.type),j=y(at.internalFormat,ot,J,at.normalized,at.colorSpace);st(x)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Te(x),j,x.width,x.height):P?e.renderbufferStorageMultisample(e.RENDERBUFFER,Te(x),j,x.width,x.height):e.renderbufferStorage(e.RENDERBUFFER,j,x.width,x.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Ge(w,x,P){let z=x.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,w),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let k=i.get(x.depthTexture);if(k.__renderTarget=x,(!k.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),z){if(k.__webglInit===void 0&&(k.__webglInit=!0,x.depthTexture.addEventListener("dispose",C)),k.__webglTexture===void 0){k.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,k.__webglTexture),Wt(e.TEXTURE_CUBE_MAP,x.depthTexture);let lt=a.convert(x.depthTexture.format),wt=a.convert(x.depthTexture.type),ft;x.depthTexture.format===cs?ft=e.DEPTH_COMPONENT24:x.depthTexture.format===Ba&&(ft=e.DEPTH24_STENCIL8);for(let ct=0;ct<6;ct++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+ct,0,ft,x.width,x.height,0,lt,wt,null)}}else it(x.depthTexture,0);let at=k.__webglTexture,ot=Te(x),J=z?e.TEXTURE_CUBE_MAP_POSITIVE_X+P:e.TEXTURE_2D,j=x.depthTexture.format===Ba?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(x.depthTexture.format===cs)st(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,J,at,0,ot):e.framebufferTexture2D(e.FRAMEBUFFER,j,J,at,0);else if(x.depthTexture.format===Ba)st(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,J,at,0,ot):e.framebufferTexture2D(e.FRAMEBUFFER,j,J,at,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function qt(w){let x=i.get(w),P=w.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==w.depthTexture){let z=w.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),z){let k=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,z.removeEventListener("dispose",k)};z.addEventListener("dispose",k),x.__depthDisposeCallback=k}x.__boundDepthTexture=z}if(w.depthTexture&&!x.__autoAllocateDepthBuffer)if(P)for(let z=0;z<6;z++)Ge(x.__webglFramebuffer[z],w,z);else{let z=w.texture.mipmaps;z&&z.length>0?Ge(x.__webglFramebuffer[0],w,0):Ge(x.__webglFramebuffer,w,0)}else if(P){x.__webglDepthbuffer=[];for(let z=0;z<6;z++)if(n.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer[z]),x.__webglDepthbuffer[z]===void 0)x.__webglDepthbuffer[z]=e.createRenderbuffer(),Gt(x.__webglDepthbuffer[z],w,!1);else{let k=w.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,at=x.__webglDepthbuffer[z];e.bindRenderbuffer(e.RENDERBUFFER,at),e.framebufferRenderbuffer(e.FRAMEBUFFER,k,e.RENDERBUFFER,at)}}else{let z=w.texture.mipmaps;if(z&&z.length>0?n.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer[0]):n.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=e.createRenderbuffer(),Gt(x.__webglDepthbuffer,w,!1);else{let k=w.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,at=x.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,at),e.framebufferRenderbuffer(e.FRAMEBUFFER,k,e.RENDERBUFFER,at)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function ie(w,x,P){let z=i.get(w);x!==void 0&&_t(z.__webglFramebuffer,w,w.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),P!==void 0&&qt(w)}function oe(w){let x=w.texture,P=i.get(w),z=i.get(x);w.addEventListener("dispose",g);let k=w.textures,at=w.isWebGLCubeRenderTarget===!0,ot=k.length>1;if(ot||(z.__webglTexture===void 0&&(z.__webglTexture=e.createTexture()),z.__version=x.version,r.memory.textures++),at){P.__webglFramebuffer=[];for(let J=0;J<6;J++)if(x.mipmaps&&x.mipmaps.length>0){P.__webglFramebuffer[J]=[];for(let j=0;j<x.mipmaps.length;j++)P.__webglFramebuffer[J][j]=e.createFramebuffer()}else P.__webglFramebuffer[J]=e.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){P.__webglFramebuffer=[];for(let J=0;J<x.mipmaps.length;J++)P.__webglFramebuffer[J]=e.createFramebuffer()}else P.__webglFramebuffer=e.createFramebuffer();if(ot)for(let J=0,j=k.length;J<j;J++){let lt=i.get(k[J]);lt.__webglTexture===void 0&&(lt.__webglTexture=e.createTexture(),r.memory.textures++)}if(w.samples>0&&st(w)===!1){P.__webglMultisampledFramebuffer=e.createFramebuffer(),P.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,P.__webglMultisampledFramebuffer);for(let J=0;J<k.length;J++){let j=k[J];P.__webglColorRenderbuffer[J]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,P.__webglColorRenderbuffer[J]);let lt=a.convert(j.format,j.colorSpace),wt=a.convert(j.type),ft=y(j.internalFormat,lt,wt,j.normalized,j.colorSpace,w.isXRRenderTarget===!0),ct=Te(w);e.renderbufferStorageMultisample(e.RENDERBUFFER,ct,ft,w.width,w.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+J,e.RENDERBUFFER,P.__webglColorRenderbuffer[J])}e.bindRenderbuffer(e.RENDERBUFFER,null),w.depthBuffer&&(P.__webglDepthRenderbuffer=e.createRenderbuffer(),Gt(P.__webglDepthRenderbuffer,w,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(at){n.bindTexture(e.TEXTURE_CUBE_MAP,z.__webglTexture),Wt(e.TEXTURE_CUBE_MAP,x);for(let J=0;J<6;J++)if(x.mipmaps&&x.mipmaps.length>0)for(let j=0;j<x.mipmaps.length;j++)_t(P.__webglFramebuffer[J][j],w,x,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+J,j);else _t(P.__webglFramebuffer[J],w,x,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+J,0);h(x)&&m(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(ot){for(let J=0,j=k.length;J<j;J++){let lt=k[J],wt=i.get(lt),ft=e.TEXTURE_2D;(w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(ft=w.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(ft,wt.__webglTexture),Wt(ft,lt),_t(P.__webglFramebuffer,w,lt,e.COLOR_ATTACHMENT0+J,ft,0),h(lt)&&m(ft)}n.unbindTexture()}else{let J=e.TEXTURE_2D;if((w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(J=w.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(J,z.__webglTexture),Wt(J,x),x.mipmaps&&x.mipmaps.length>0)for(let j=0;j<x.mipmaps.length;j++)_t(P.__webglFramebuffer[j],w,x,e.COLOR_ATTACHMENT0,J,j);else _t(P.__webglFramebuffer,w,x,e.COLOR_ATTACHMENT0,J,0);h(x)&&m(J),n.unbindTexture()}w.depthBuffer&&qt(w)}function Yt(w){let x=w.textures;for(let P=0,z=x.length;P<z;P++){let k=x[P];if(h(k)){let at=S(w),ot=i.get(k).__webglTexture;n.bindTexture(at,ot),m(at),n.unbindTexture()}}}let _e=[],ke=[];function an(w){if(w.samples>0){if(st(w)===!1){let x=w.textures,P=w.width,z=w.height,k=e.COLOR_BUFFER_BIT,at=w.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ot=i.get(w),J=x.length>1;if(J)for(let lt=0;lt<x.length;lt++)n.bindFramebuffer(e.FRAMEBUFFER,ot.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+lt,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,ot.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+lt,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,ot.__webglMultisampledFramebuffer);let j=w.texture.mipmaps;j&&j.length>0?n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ot.__webglFramebuffer[0]):n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ot.__webglFramebuffer);for(let lt=0;lt<x.length;lt++){if(w.resolveDepthBuffer&&(w.depthBuffer&&(k|=e.DEPTH_BUFFER_BIT),w.stencilBuffer&&w.resolveStencilBuffer&&(k|=e.STENCIL_BUFFER_BIT)),J){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,ot.__webglColorRenderbuffer[lt]);let wt=i.get(x[lt]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,wt,0)}e.blitFramebuffer(0,0,P,z,0,0,P,z,k,e.NEAREST),l===!0&&(_e.length=0,ke.length=0,_e.push(e.COLOR_ATTACHMENT0+lt),w.depthBuffer&&w.storeMultisampledDepthBuffer===!1&&(_e.push(at),ke.push(at),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,ke)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,_e))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),J)for(let lt=0;lt<x.length;lt++){n.bindFramebuffer(e.FRAMEBUFFER,ot.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+lt,e.RENDERBUFFER,ot.__webglColorRenderbuffer[lt]);let wt=i.get(x[lt]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,ot.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+lt,e.TEXTURE_2D,wt,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ot.__webglMultisampledFramebuffer)}else if(w.depthBuffer&&w.storeMultisampledDepthBuffer===!1&&l){let x=w.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[x])}}}function Te(w){return Math.min(s.maxSamples,w.samples)}function st(w){let x=i.get(w);return w.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function N(w){let x=r.render.frame;f.get(w)!==x&&(f.set(w,x),w.update())}function jt(w,x){let P=w.colorSpace,z=w.format,k=w.type;return w.isCompressedTexture===!0||w.isVideoTexture===!0||P!==yc&&P!==Vs&&(te.getTransfer(P)===de?(z!==Ti||k!==Jn)&&Dt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ut("WebGLTextures: Unsupported texture color space:",P)),x}function rt(w){return typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement?(c.width=w.naturalWidth||w.width,c.height=w.naturalHeight||w.height):typeof VideoFrame<"u"&&w instanceof VideoFrame?(c.width=w.displayWidth,c.height=w.displayHeight):(c.width=w.width,c.height=w.height),c}this.allocateTextureUnit=Y,this.resetTextureUnits=F,this.getTextureUnits=D,this.setTextureUnits=G,this.setTexture2D=it,this.setTexture2DArray=W,this.setTexture3D=$,this.setTextureCube=et,this.rebindTextures=ie,this.setupRenderTarget=oe,this.updateRenderTargetMipmap=Yt,this.updateMultisampleRenderTarget=an,this.setupDepthRenderbuffer=qt,this.setupFrameBufferTexture=_t,this.useMultisampledRTT=st,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function fD(e,t){function n(i,s=Vs){let a,r=te.getTransfer(s);if(i===Jn)return e.UNSIGNED_BYTE;if(i===ud)return e.UNSIGNED_SHORT_4_4_4_4;if(i===hd)return e.UNSIGNED_SHORT_5_5_5_1;if(i===s_)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===a_)return e.UNSIGNED_INT_10F_11F_11F_REV;if(i===n_)return e.BYTE;if(i===i_)return e.SHORT;if(i===nl)return e.UNSIGNED_SHORT;if(i===cd)return e.INT;if(i===Fi)return e.UNSIGNED_INT;if(i===Hi)return e.FLOAT;if(i===Vi)return e.HALF_FLOAT;if(i===r_)return e.ALPHA;if(i===o_)return e.RGB;if(i===Ti)return e.RGBA;if(i===cs)return e.DEPTH_COMPONENT;if(i===Ba)return e.DEPTH_STENCIL;if(i===l_)return e.RED;if(i===fd)return e.RED_INTEGER;if(i===za)return e.RG;if(i===dd)return e.RG_INTEGER;if(i===pd)return e.RGBA_INTEGER;if(i===Kc||i===Qc||i===jc||i===$c)if(r===de)if(a=t.get("WEBGL_compressed_texture_s3tc_srgb"),a!==null){if(i===Kc)return a.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Qc)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===jc)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===$c)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(a=t.get("WEBGL_compressed_texture_s3tc"),a!==null){if(i===Kc)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Qc)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===jc)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===$c)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===md||i===gd||i===_d||i===vd)if(a=t.get("WEBGL_compressed_texture_pvrtc"),a!==null){if(i===md)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===gd)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===_d)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===vd)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===yd||i===xd||i===Sd||i===Md||i===bd||i===tu||i===Ed)if(a=t.get("WEBGL_compressed_texture_etc"),a!==null){if(i===yd||i===xd)return r===de?a.COMPRESSED_SRGB8_ETC2:a.COMPRESSED_RGB8_ETC2;if(i===Sd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:a.COMPRESSED_RGBA8_ETC2_EAC;if(i===Md)return a.COMPRESSED_R11_EAC;if(i===bd)return a.COMPRESSED_SIGNED_R11_EAC;if(i===tu)return a.COMPRESSED_RG11_EAC;if(i===Ed)return a.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===Td||i===Ad||i===wd||i===Cd||i===Rd||i===Nd||i===Dd||i===Ud||i===Ld||i===Od||i===Id||i===Pd||i===Bd||i===zd)if(a=t.get("WEBGL_compressed_texture_astc"),a!==null){if(i===Td)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:a.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===Ad)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:a.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===wd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:a.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Cd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:a.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Rd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:a.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Nd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:a.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Dd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:a.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Ud)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:a.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Ld)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:a.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Od)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:a.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Id)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:a.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===Pd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:a.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===Bd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:a.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===zd)return r===de?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:a.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Fd||i===Hd||i===Vd)if(a=t.get("EXT_texture_compression_bptc"),a!==null){if(i===Fd)return r===de?a.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:a.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Hd)return a.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===Vd)return a.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Gd||i===kd||i===eu||i===Xd)if(a=t.get("EXT_texture_compression_rgtc"),a!==null){if(i===Gd)return a.COMPRESSED_RED_RGTC1_EXT;if(i===kd)return a.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===eu)return a.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Xd)return a.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===il?e.UNSIGNED_INT_24_8:e[i]!==void 0?e[i]:null}return{convert:n}}var dD=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,pD=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,L_=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,n){if(this.texture===null){let i=new Pc(t.texture);(t.depthNear!==n.depthNear||t.depthFar!==n.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=i}}getMesh(t){if(this.texture!==null&&this.mesh===null){let n=t.cameras[0].viewport,i=new hi({vertexShader:dD,fragmentShader:pD,uniforms:{depthColor:{value:this.texture},depthWidth:{value:n.z},depthHeight:{value:n.w}}});this.mesh=new Vt(new zc(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},O_=class extends us{constructor(t,n){super();let i=this,s=null,a=1,r=null,o="local-floor",l=1,c=null,f=null,p=null,u=null,d=null,v=null,M=typeof XRWebGLBinding<"u",_=new L_,h={},m=n.getContextAttributes(),S=null,y=null,E=[],A=[],C=new It,g=null,b=null,R=new xn;R.viewport=new ze;let U=new xn;U.viewport=new ze;let I=[R,U],F=new sd,D=null,G=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(q){let tt=E[q];return tt===void 0&&(tt=new Yo,E[q]=tt),tt.getTargetRaySpace()},this.getControllerGrip=function(q){let tt=E[q];return tt===void 0&&(tt=new Yo,E[q]=tt),tt.getGripSpace()},this.getHand=function(q){let tt=E[q];return tt===void 0&&(tt=new Yo,E[q]=tt),tt.getHandSpace()};function Y(q){let tt=A.indexOf(q.inputSource);if(tt===-1)return;let vt=E[tt];vt!==void 0&&(vt.update(q.inputSource,q.frame,c||r),vt.dispatchEvent({type:q.type,data:q.inputSource}))}function Z(){s.removeEventListener("select",Y),s.removeEventListener("selectstart",Y),s.removeEventListener("selectend",Y),s.removeEventListener("squeeze",Y),s.removeEventListener("squeezestart",Y),s.removeEventListener("squeezeend",Y),s.removeEventListener("end",Z),s.removeEventListener("inputsourceschange",it);for(let q=0;q<E.length;q++){let tt=A[q];tt!==null&&(A[q]=null,E[q].disconnect(tt))}D=null,G=null,_.reset();for(let q in h)delete h[q];if(t.setRenderTarget(S),d=null,u=null,p=null,s=null,y=null,ne.stop(),i.isPresenting=!1,t.setPixelRatio(g),t.setSize(C.width,C.height,!1),b!==null){let q=b.camera;q.fov=b.fov,q.zoom=b.zoom,q.updateProjectionMatrix(),b=null}i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(q){a=q,i.isPresenting===!0&&Dt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(q){o=q,i.isPresenting===!0&&Dt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||r},this.setReferenceSpace=function(q){c=q},this.getBaseLayer=function(){return u!==null?u:d},this.getBinding=function(){return p===null&&M&&(p=new XRWebGLBinding(s,n)),p},this.getFrame=function(){return v},this.getSession=function(){return s},this.setSession=async function(q){if(s=q,s!==null){if(S=t.getRenderTarget(),s.addEventListener("select",Y),s.addEventListener("selectstart",Y),s.addEventListener("selectend",Y),s.addEventListener("squeeze",Y),s.addEventListener("squeezestart",Y),s.addEventListener("squeezeend",Y),s.addEventListener("end",Z),s.addEventListener("inputsourceschange",it),m.xrCompatible!==!0&&await n.makeXRCompatible(),g=t.getPixelRatio(),t.getSize(C),M&&"createProjectionLayer"in XRWebGLBinding.prototype){let vt=null,Ot=null,_t=null;m.depth&&(_t=m.stencil?n.DEPTH24_STENCIL8:n.DEPTH_COMPONENT24,vt=m.stencil?Ba:cs,Ot=m.stencil?il:Fi);let Gt={colorFormat:n.RGBA8,depthFormat:_t,scaleFactor:a};p=this.getBinding(),u=p.createProjectionLayer(Gt),s.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),y=new Yn(u.textureWidth,u.textureHeight,{format:Ti,type:Jn,depthTexture:new Na(u.textureWidth,u.textureHeight,Ot,void 0,void 0,void 0,void 0,void 0,void 0,vt),stencilBuffer:m.stencil,colorSpace:t.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}else{let vt={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:a};d=new XRWebGLLayer(s,n,vt),s.updateRenderState({baseLayer:d}),t.setPixelRatio(1),t.setSize(d.framebufferWidth,d.framebufferHeight,!1),y=new Yn(d.framebufferWidth,d.framebufferHeight,{format:Ti,type:Jn,colorSpace:t.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,r=await s.requestReferenceSpace(o),ne.setContext(s),ne.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function it(q){for(let tt=0;tt<q.removed.length;tt++){let vt=q.removed[tt],Ot=A.indexOf(vt);Ot>=0&&(A[Ot]=null,E[Ot].disconnect(vt))}for(let tt=0;tt<q.added.length;tt++){let vt=q.added[tt],Ot=A.indexOf(vt);if(Ot===-1){for(let Gt=0;Gt<E.length;Gt++)if(Gt>=A.length){A.push(vt),Ot=Gt;break}else if(A[Gt]===null){A[Gt]=vt,Ot=Gt;break}if(Ot===-1)break}let _t=E[Ot];_t&&_t.connect(vt)}}let W=new B,$=new B;function et(q,tt,vt){W.setFromMatrixPosition(tt.matrixWorld),$.setFromMatrixPosition(vt.matrixWorld);let Ot=W.distanceTo($),_t=tt.projectionMatrix.elements,Gt=vt.projectionMatrix.elements,Ge=_t[14]/(_t[10]-1),qt=_t[14]/(_t[10]+1),ie=(_t[9]+1)/_t[5],oe=(_t[9]-1)/_t[5],Yt=(_t[8]-1)/_t[0],_e=(Gt[8]+1)/Gt[0],ke=Ge*Yt,an=Ge*_e,Te=Ot/(-Yt+_e),st=Te*-Yt;if(tt.matrixWorld.decompose(q.position,q.quaternion,q.scale),q.translateX(st),q.translateZ(Te),q.matrixWorld.compose(q.position,q.quaternion,q.scale),q.matrixWorldInverse.copy(q.matrixWorld).invert(),_t[10]===-1)q.projectionMatrix.copy(tt.projectionMatrix),q.projectionMatrixInverse.copy(tt.projectionMatrixInverse);else{let N=Ge+Te,jt=qt+Te,rt=ke-st,w=an+(Ot-st),x=ie*qt/jt*N,P=oe*qt/jt*N;q.projectionMatrix.makePerspective(rt,w,x,P,N,jt),q.projectionMatrixInverse.copy(q.projectionMatrix).invert()}}function At(q,tt){tt===null?q.matrixWorld.copy(q.matrix):q.matrixWorld.multiplyMatrices(tt.matrixWorld,q.matrix),q.matrixWorldInverse.copy(q.matrixWorld).invert()}this.updateCamera=function(q){if(s===null)return;let tt=q.near,vt=q.far;_.texture!==null&&(_.depthNear>0&&(tt=_.depthNear),_.depthFar>0&&(vt=_.depthFar)),F.near=U.near=R.near=tt,F.far=U.far=R.far=vt,(D!==F.near||G!==F.far)&&(s.updateRenderState({depthNear:F.near,depthFar:F.far}),D=F.near,G=F.far),F.layers.mask=q.layers.mask|6,R.layers.mask=F.layers.mask&-5,U.layers.mask=F.layers.mask&-3;let Ot=q.parent,_t=F.cameras;At(F,Ot);for(let Gt=0;Gt<_t.length;Gt++)At(_t[Gt],Ot);_t.length===2?et(F,R,U):F.projectionMatrix.copy(R.projectionMatrix),b===null&&q.isPerspectiveCamera&&(b={camera:q,fov:q.fov,zoom:q.zoom}),St(q,F,Ot)};function St(q,tt,vt){vt===null?q.matrix.copy(tt.matrixWorld):(q.matrix.copy(vt.matrixWorld),q.matrix.invert(),q.matrix.multiply(tt.matrixWorld)),q.matrix.decompose(q.position,q.quaternion,q.scale),q.updateMatrixWorld(!0),q.projectionMatrix.copy(tt.projectionMatrix),q.projectionMatrixInverse.copy(tt.projectionMatrixInverse),q.isPerspectiveCamera&&(q.fov=Uf*2*Math.atan(1/q.projectionMatrix.elements[5]),q.zoom=1)}this.getCamera=function(){return F},this.getFoveation=function(){if(!(u===null&&d===null))return l},this.setFoveation=function(q){l=q,u!==null&&(u.fixedFoveation=q),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=q)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(F)},this.getCameraTexture=function(q){return h[q]};let ae=null;function Wt(q,tt){if(f=tt.getViewerPose(c||r),v=tt,f!==null){let vt=f.views;d!==null&&(t.setRenderTargetFramebuffer(y,d.framebuffer),t.setRenderTarget(y));let Ot=!1;vt.length!==F.cameras.length&&(F.cameras.length=0,Ot=!0);for(let qt=0;qt<vt.length;qt++){let ie=vt[qt],oe=null;if(d!==null)oe=d.getViewport(ie);else{let _e=p.getViewSubImage(u,ie);oe=_e.viewport,qt===0&&(t.setRenderTargetTextures(y,_e.colorTexture,_e.depthStencilTexture),t.setRenderTarget(y))}let Yt=I[qt];Yt===void 0&&(Yt=new xn,Yt.layers.enable(qt),Yt.viewport=new ze,I[qt]=Yt),Yt.matrix.fromArray(ie.transform.matrix),Yt.matrix.decompose(Yt.position,Yt.quaternion,Yt.scale),Yt.projectionMatrix.fromArray(ie.projectionMatrix),Yt.projectionMatrixInverse.copy(Yt.projectionMatrix).invert(),Yt.viewport.set(oe.x,oe.y,oe.width,oe.height),qt===0&&(F.matrix.copy(Yt.matrix),F.matrix.decompose(F.position,F.quaternion,F.scale)),Ot===!0&&F.cameras.push(Yt)}let _t=s.enabledFeatures;if(_t&&_t.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&M){p=i.getBinding();let qt=p.getDepthInformation(vt[0]);qt&&qt.isValid&&qt.texture&&_.init(qt,s.renderState)}if(_t&&_t.includes("camera-access")&&M){t.state.unbindTexture(),p=i.getBinding();for(let qt=0;qt<vt.length;qt++){let ie=vt[qt].camera;if(ie){let oe=h[ie];oe||(oe=new Pc,h[ie]=oe);let Yt=p.getCameraImage(ie);oe.sourceTexture=Yt}}}}for(let vt=0;vt<E.length;vt++){let Ot=A[vt],_t=E[vt];Ot!==null&&_t!==void 0&&_t.update(Ot,tt,c||r)}ae&&ae(q,tt),tt.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:tt}),v=null}let ne=new j1;ne.setAnimationLoop(Wt),this.setAnimationLoop=function(q){ae=q},this.dispose=function(){}}},mD=new Oe,sE=new Bt;sE.set(-1,0,0,0,1,0,0,0,1);function gD(e,t){function n(_,h){_.matrixAutoUpdate===!0&&_.updateMatrix(),h.value.copy(_.matrix)}function i(_,h){h.color.getRGB(_.fogColor.value,h_(e)),h.isFog?(_.fogNear.value=h.near,_.fogFar.value=h.far):h.isFogExp2&&(_.fogDensity.value=h.density)}function s(_,h,m,S,y){h.isNodeMaterial?h.uniformsNeedUpdate=!1:h.isMeshBasicMaterial?a(_,h):h.isMeshLambertMaterial?(a(_,h),h.envMap&&(_.envMapIntensity.value=h.envMapIntensity)):h.isMeshToonMaterial?(a(_,h),p(_,h)):h.isMeshPhongMaterial?(a(_,h),f(_,h),h.envMap&&(_.envMapIntensity.value=h.envMapIntensity)):h.isMeshStandardMaterial?(a(_,h),u(_,h),h.isMeshPhysicalMaterial&&d(_,h,y)):h.isMeshMatcapMaterial?(a(_,h),v(_,h)):h.isMeshDepthMaterial?a(_,h):h.isMeshDistanceMaterial?(a(_,h),M(_,h)):h.isMeshNormalMaterial?a(_,h):h.isLineBasicMaterial?(r(_,h),h.isLineDashedMaterial&&o(_,h)):h.isPointsMaterial?l(_,h,m,S):h.isSpriteMaterial?c(_,h):h.isShadowMaterial?(_.color.value.copy(h.color),_.opacity.value=h.opacity):h.isShaderMaterial&&(h.uniformsNeedUpdate=!1)}function a(_,h){_.opacity.value=h.opacity,h.color&&_.diffuse.value.copy(h.color),h.emissive&&_.emissive.value.copy(h.emissive).multiplyScalar(h.emissiveIntensity),h.map&&(_.map.value=h.map,n(h.map,_.mapTransform)),h.alphaMap&&(_.alphaMap.value=h.alphaMap,n(h.alphaMap,_.alphaMapTransform)),h.bumpMap&&(_.bumpMap.value=h.bumpMap,n(h.bumpMap,_.bumpMapTransform),_.bumpScale.value=h.bumpScale,h.side===Fn&&(_.bumpScale.value*=-1)),h.normalMap&&(_.normalMap.value=h.normalMap,n(h.normalMap,_.normalMapTransform),_.normalScale.value.copy(h.normalScale),h.side===Fn&&_.normalScale.value.negate()),h.displacementMap&&(_.displacementMap.value=h.displacementMap,n(h.displacementMap,_.displacementMapTransform),_.displacementScale.value=h.displacementScale,_.displacementBias.value=h.displacementBias),h.emissiveMap&&(_.emissiveMap.value=h.emissiveMap,n(h.emissiveMap,_.emissiveMapTransform)),h.specularMap&&(_.specularMap.value=h.specularMap,n(h.specularMap,_.specularMapTransform)),h.alphaTest>0&&(_.alphaTest.value=h.alphaTest);let m=t.get(h),S=m.envMap,y=m.envMapRotation;S&&(_.envMap.value=S,_.envMapRotation.value.setFromMatrix4(mD.makeRotationFromEuler(y)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&_.envMapRotation.value.premultiply(sE),_.reflectivity.value=h.reflectivity,_.ior.value=h.ior,_.refractionRatio.value=h.refractionRatio),h.lightMap&&(_.lightMap.value=h.lightMap,_.lightMapIntensity.value=h.lightMapIntensity,n(h.lightMap,_.lightMapTransform)),h.aoMap&&(_.aoMap.value=h.aoMap,_.aoMapIntensity.value=h.aoMapIntensity,n(h.aoMap,_.aoMapTransform))}function r(_,h){_.diffuse.value.copy(h.color),_.opacity.value=h.opacity,h.map&&(_.map.value=h.map,n(h.map,_.mapTransform))}function o(_,h){_.dashSize.value=h.dashSize,_.totalSize.value=h.dashSize+h.gapSize,_.scale.value=h.scale}function l(_,h,m,S){_.diffuse.value.copy(h.color),_.opacity.value=h.opacity,_.size.value=h.size*m,_.scale.value=S*.5,h.map&&(_.map.value=h.map,n(h.map,_.uvTransform)),h.alphaMap&&(_.alphaMap.value=h.alphaMap,n(h.alphaMap,_.alphaMapTransform)),h.alphaTest>0&&(_.alphaTest.value=h.alphaTest)}function c(_,h){_.diffuse.value.copy(h.color),_.opacity.value=h.opacity,_.rotation.value=h.rotation,h.map&&(_.map.value=h.map,n(h.map,_.mapTransform)),h.alphaMap&&(_.alphaMap.value=h.alphaMap,n(h.alphaMap,_.alphaMapTransform)),h.alphaTest>0&&(_.alphaTest.value=h.alphaTest)}function f(_,h){_.specular.value.copy(h.specular),_.shininess.value=Math.max(h.shininess,1e-4)}function p(_,h){h.gradientMap&&(_.gradientMap.value=h.gradientMap)}function u(_,h){_.metalness.value=h.metalness,h.metalnessMap&&(_.metalnessMap.value=h.metalnessMap,n(h.metalnessMap,_.metalnessMapTransform)),_.roughness.value=h.roughness,h.roughnessMap&&(_.roughnessMap.value=h.roughnessMap,n(h.roughnessMap,_.roughnessMapTransform)),h.envMap&&(_.envMapIntensity.value=h.envMapIntensity)}function d(_,h,m){_.ior.value=h.ior,h.sheen>0&&(_.sheenColor.value.copy(h.sheenColor).multiplyScalar(h.sheen),_.sheenRoughness.value=h.sheenRoughness,h.sheenColorMap&&(_.sheenColorMap.value=h.sheenColorMap,n(h.sheenColorMap,_.sheenColorMapTransform)),h.sheenRoughnessMap&&(_.sheenRoughnessMap.value=h.sheenRoughnessMap,n(h.sheenRoughnessMap,_.sheenRoughnessMapTransform))),h.clearcoat>0&&(_.clearcoat.value=h.clearcoat,_.clearcoatRoughness.value=h.clearcoatRoughness,h.clearcoatMap&&(_.clearcoatMap.value=h.clearcoatMap,n(h.clearcoatMap,_.clearcoatMapTransform)),h.clearcoatRoughnessMap&&(_.clearcoatRoughnessMap.value=h.clearcoatRoughnessMap,n(h.clearcoatRoughnessMap,_.clearcoatRoughnessMapTransform)),h.clearcoatNormalMap&&(_.clearcoatNormalMap.value=h.clearcoatNormalMap,n(h.clearcoatNormalMap,_.clearcoatNormalMapTransform),_.clearcoatNormalScale.value.copy(h.clearcoatNormalScale),h.side===Fn&&_.clearcoatNormalScale.value.negate())),h.dispersion>0&&(_.dispersion.value=h.dispersion),h.retroreflectivity>0&&(_.retroreflectivity.value=h.retroreflectivity),h.iridescence>0&&(_.iridescence.value=h.iridescence,_.iridescenceIOR.value=h.iridescenceIOR,_.iridescenceThicknessMinimum.value=h.iridescenceThicknessRange[0],_.iridescenceThicknessMaximum.value=h.iridescenceThicknessRange[1],h.iridescenceMap&&(_.iridescenceMap.value=h.iridescenceMap,n(h.iridescenceMap,_.iridescenceMapTransform)),h.iridescenceThicknessMap&&(_.iridescenceThicknessMap.value=h.iridescenceThicknessMap,n(h.iridescenceThicknessMap,_.iridescenceThicknessMapTransform))),h.transmission>0&&(_.transmission.value=h.transmission,_.transmissionSamplerMap.value=m.texture,_.transmissionSamplerSize.value.set(m.width,m.height),h.transmissionMap&&(_.transmissionMap.value=h.transmissionMap,n(h.transmissionMap,_.transmissionMapTransform)),_.thickness.value=h.thickness,h.thicknessMap&&(_.thicknessMap.value=h.thicknessMap,n(h.thicknessMap,_.thicknessMapTransform)),_.attenuationDistance.value=h.attenuationDistance,_.attenuationColor.value.copy(h.attenuationColor)),h.anisotropy>0&&(_.anisotropyVector.value.set(h.anisotropy*Math.cos(h.anisotropyRotation),h.anisotropy*Math.sin(h.anisotropyRotation)),h.anisotropyMap&&(_.anisotropyMap.value=h.anisotropyMap,n(h.anisotropyMap,_.anisotropyMapTransform))),_.specularIntensity.value=h.specularIntensity,_.specularColor.value.copy(h.specularColor),h.specularColorMap&&(_.specularColorMap.value=h.specularColorMap,n(h.specularColorMap,_.specularColorMapTransform)),h.specularIntensityMap&&(_.specularIntensityMap.value=h.specularIntensityMap,n(h.specularIntensityMap,_.specularIntensityMapTransform))}function v(_,h){h.matcap&&(_.matcap.value=h.matcap)}function M(_,h){let m=t.get(h).light;_.referencePosition.value.setFromMatrixPosition(m.matrixWorld),_.nearDistance.value=m.shadow.camera.near,_.farDistance.value=m.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:s}}function _D(e,t,n,i){let s={},a={},r=[],o=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function l(y,E){let A=E.program;i.uniformBlockBinding(y,A)}function c(y,E){let A=s[y.id];A===void 0&&(_(y),A=f(y),s[y.id]=A,y.addEventListener("dispose",m));let C=E.program;i.updateUBOMapping(y,C);let g=t.render.frame;a[y.id]!==g&&(u(y),a[y.id]=g)}function f(y){let E=p();y.__bindingPointIndex=E;let A=e.createBuffer(),C=y.__size,g=y.usage;return e.bindBuffer(e.UNIFORM_BUFFER,A),e.bufferData(e.UNIFORM_BUFFER,C,g),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,E,A),A}function p(){for(let y=0;y<o;y++)if(r.indexOf(y)===-1)return r.push(y),y;return Ut("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(y){let E=s[y.id],A=y.uniforms,C=y.__cache;e.bindBuffer(e.UNIFORM_BUFFER,E);for(let g=0,b=A.length;g<b;g++){let R=A[g];if(Array.isArray(R))for(let U=0,I=R.length;U<I;U++)d(R[U],g,U,C);else d(R,g,0,C)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function d(y,E,A,C){if(M(y,E,A,C)===!0){let g=y.__offset,b=y.value;if(Array.isArray(b)){let R=0;for(let U=0;U<b.length;U++){let I=b[U],F=h(I);v(I,y.__data,R),typeof I!="number"&&typeof I!="boolean"&&!I.isMatrix3&&!ArrayBuffer.isView(I)&&(R+=F.storage/Float32Array.BYTES_PER_ELEMENT)}}else v(b,y.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,g,y.__data)}}function v(y,E,A){typeof y=="number"||typeof y=="boolean"?E[0]=y:y.isMatrix3?(E[0]=y.elements[0],E[1]=y.elements[1],E[2]=y.elements[2],E[3]=0,E[4]=y.elements[3],E[5]=y.elements[4],E[6]=y.elements[5],E[7]=0,E[8]=y.elements[6],E[9]=y.elements[7],E[10]=y.elements[8],E[11]=0):ArrayBuffer.isView(y)?E.set(new y.constructor(y.buffer,y.byteOffset,E.length)):y.toArray(E,A)}function M(y,E,A,C){let g=y.value,b=E+"_"+A;if(C[b]===void 0)return typeof g=="number"||typeof g=="boolean"?C[b]=g:ArrayBuffer.isView(g)?C[b]=g.slice():C[b]=g.clone(),!0;{let R=C[b];if(typeof g=="number"||typeof g=="boolean"){if(R!==g)return C[b]=g,!0}else{if(ArrayBuffer.isView(g))return!0;if(R.equals(g)===!1)return R.copy(g),!0}}return!1}function _(y){let E=y.uniforms,A=0,C=16;for(let b=0,R=E.length;b<R;b++){let U=Array.isArray(E[b])?E[b]:[E[b]];for(let I=0,F=U.length;I<F;I++){let D=U[I],G=Array.isArray(D.value)?D.value:[D.value];for(let Y=0,Z=G.length;Y<Z;Y++){let it=G[Y],W=h(it),$=A%C,et=$%W.boundary,At=$+et;A+=et,At!==0&&C-At<W.storage&&(A+=C-At),D.__data=new Float32Array(W.storage/Float32Array.BYTES_PER_ELEMENT),D.__offset=A,A+=W.storage}}}let g=A%C;return g>0&&(A+=C-g),y.__size=A,y.__cache={},this}function h(y){let E={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(E.boundary=4,E.storage=4):y.isVector2?(E.boundary=8,E.storage=8):y.isVector3||y.isColor?(E.boundary=16,E.storage=12):y.isVector4?(E.boundary=16,E.storage=16):y.isMatrix3?(E.boundary=48,E.storage=48):y.isMatrix4?(E.boundary=64,E.storage=64):y.isTexture?Dt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(y)?(E.boundary=16,E.storage=y.byteLength):Dt("WebGLRenderer: Unsupported uniform value type.",y),E}function m(y){let E=y.target;E.removeEventListener("dispose",m);let A=r.indexOf(E.__bindingPointIndex);r.splice(A,1),e.deleteBuffer(s[E.id]),delete s[E.id],delete a[E.id]}function S(){for(let y in s)e.deleteBuffer(s[y]);r=[],s={},a={}}return{bind:l,update:c,dispose:S}}var vD=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),ms=null;function yD(){return ms===null&&(ms=new Bf(vD,16,16,za,Vi),ms.name="DFG_LUT",ms.minFilter=Mn,ms.magFilter=Mn,ms.wrapS=ls,ms.wrapT=ls,ms.generateMipmaps=!1,ms.needsUpdate=!0),ms}var jd=class{constructor(t={}){let{canvas:n=M1(),context:i=null,depth:s=!0,stencil:a=!1,alpha:r=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:f="default",failIfMajorPerformanceCaveat:p=!1,reversedDepthBuffer:u=!1,outputBufferType:d=Jn}=t;this.isWebGLRenderer=!0;let v;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");v=i.getContextAttributes().alpha}else v=r;let M=d,_=new Set([pd,dd,fd]),h=new Set([Jn,Fi,nl,il,ud,hd]),m=new Uint32Array(4),S=new Int32Array(4),y=new B,E=null,A=null,C=[],g=[],b=null;this.domElement=n,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=zi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let R=this,U=!1,I=null,F=null,D=null,G=null;this._outputColorSpace=ci;let Y=0,Z=0,it=null,W=-1,$=null,et=new ze,At=new ze,St=null,ae=new Ht(0),Wt=0,ne=n.width,q=n.height,tt=1,vt=null,Ot=null,_t=new ze(0,0,ne,q),Gt=new ze(0,0,ne,q),Ge=!1,qt=new Jo,ie=!1,oe=!1,Yt=new Oe,_e=new B,ke=new ze,an={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Te=!1;function st(){return it===null?tt:1}let N=i;function jt(T,L){return n.getContext(T,L)}let rt,w,x,P,z,k,at,ot,J,j,lt,wt,ft,ct,Ct,Nt,zt,O,ut,K,ht,gt,nt;try{let T={alpha:!0,depth:s,stencil:a,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:f,failIfMajorPerformanceCaveat:p};if("setAttribute"in n&&n.setAttribute("data-engine",`three.js r${"186"}`),n.addEventListener("webglcontextlost",Ae,!1),n.addEventListener("webglcontextrestored",ue,!1),n.addEventListener("webglcontextcreationerror",Ai,!1),N===null){let L="webgl2";if(N=jt(L,T),N===null)throw jt(L)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Rt()}catch(T){throw n.removeEventListener("webglcontextlost",Ae,!1),n.removeEventListener("webglcontextrestored",ue,!1),n.removeEventListener("webglcontextcreationerror",Ai,!1),Ut("WebGLRenderer: "+T.message),T}function Rt(){rt=new A2(N),rt.init(),ht=new fD(N,rt),w=new g2(N,rt,t,ht),x=new uD(N,rt),w.reversedDepthBuffer&&u&&x.buffers.depth.setReversed(!0),F=N.createFramebuffer(),D=N.createFramebuffer(),G=N.createFramebuffer(),P=new R2(N),z=new KN,k=new hD(N,rt,x,z,w,ht,P),at=new T2(R),ot=new DC(N),gt=new p2(N,ot),J=new w2(N,ot,P,gt),j=new D2(N,J,ot,gt,P),O=new N2(N,w,k),Ct=new _2(z),lt=new JN(R,at,rt,w,gt,Ct),wt=new gD(R,z),ft=new jN,ct=new sD(rt),zt=new d2(R,at,x,j,v,l),Nt=new cD(R,j,w),nt=new _D(N,P,w,x),ut=new m2(N,rt,P),K=new C2(N,rt,P),P.programs=lt.programs,R.capabilities=w,R.extensions=rt,R.properties=z,R.renderLists=ft,R.shadowMap=Nt,R.state=x,R.info=P}M!==Jn&&(b=new L2(M,n.width,n.height,o,s,a));let Et=new O_(R,N);this.xr=Et,this.getContext=function(){return N},this.getContextAttributes=function(){return N.getContextAttributes()},this.forceContextLoss=function(){let T=rt.get("WEBGL_lose_context");T&&T.loseContext()},this.forceContextRestore=function(){let T=rt.get("WEBGL_lose_context");T&&T.restoreContext()},this.getPixelRatio=function(){return tt},this.setPixelRatio=function(T){T!==void 0&&(tt=T,this.setSize(ne,q,!1))},this.getSize=function(T){return T.set(ne,q)},this.setSize=function(T,L,X=!0){if(Et.isPresenting){Dt("WebGLRenderer: Can't change size while VR device is presenting.");return}ne=T,q=L,n.width=Math.floor(T*tt),n.height=Math.floor(L*tt),X===!0&&(n.style.width=T+"px",n.style.height=L+"px"),b!==null&&b.setSize(n.width,n.height),this.setViewport(0,0,T,L)},this.getDrawingBufferSize=function(T){return T.set(ne*tt,q*tt).floor()},this.setDrawingBufferSize=function(T,L,X){ne=T,q=L,tt=X,n.width=Math.floor(T*X),n.height=Math.floor(L*X),this.setViewport(0,0,T,L)},this.setEffects=function(T){if(M===Jn){Ut("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(T){for(let L=0;L<T.length;L++)if(T[L].isOutputPass===!0){Dt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}b.setEffects(T||[])},this.getCurrentViewport=function(T){return T.copy(et)},this.getViewport=function(T){return T.copy(_t)},this.setViewport=function(T,L,X,H){T.isVector4?_t.set(T.x,T.y,T.z,T.w):_t.set(T,L,X,H),x.viewport(et.copy(_t).multiplyScalar(tt).round())},this.getScissor=function(T){return T.copy(Gt)},this.setScissor=function(T,L,X,H){T.isVector4?Gt.set(T.x,T.y,T.z,T.w):Gt.set(T,L,X,H),x.scissor(At.copy(Gt).multiplyScalar(tt).round())},this.getScissorTest=function(){return Ge},this.setScissorTest=function(T){x.setScissorTest(Ge=T)},this.setOpaqueSort=function(T){vt=T},this.setTransparentSort=function(T){Ot=T},this.getClearColor=function(T){return T.copy(zt.getClearColor())},this.setClearColor=function(){zt.setClearColor(...arguments)},this.getClearAlpha=function(){return zt.getClearAlpha()},this.setClearAlpha=function(){zt.setClearAlpha(...arguments)},this.clear=function(T=!0,L=!0,X=!0){let H=0;if(T){let V=!1;if(it!==null){let mt=it.texture.format;V=_.has(mt)}if(V){let mt=it.texture.type,xt=h.has(mt),pt=zt.getClearColor(),Mt=zt.getClearAlpha(),Tt=pt.r,kt=pt.g,Jt=pt.b;xt?(m[0]=Tt,m[1]=kt,m[2]=Jt,m[3]=Mt,N.clearBufferuiv(N.COLOR,0,m)):(S[0]=Tt,S[1]=kt,S[2]=Jt,S[3]=Mt,N.clearBufferiv(N.COLOR,0,S))}else H|=N.COLOR_BUFFER_BIT}L&&(H|=N.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),X&&(H|=N.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),H!==0&&N.clear(H)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(T){T.setRenderer(this),I=T},this.dispose=function(){n.removeEventListener("webglcontextlost",Ae,!1),n.removeEventListener("webglcontextrestored",ue,!1),n.removeEventListener("webglcontextcreationerror",Ai,!1),zt.dispose(),ft.dispose(),ct.dispose(),z.dispose(),at.dispose(),j.dispose(),gt.dispose(),nt.dispose(),lt.dispose(),Et.dispose(),Et.removeEventListener("sessionstart",z_),Et.removeEventListener("sessionend",F_),Fa.stop()};function Ae(T){T.preventDefault(),Mc("WebGLRenderer: Context Lost."),U=!0}function ue(){Mc("WebGLRenderer: Context Restored."),U=!1;let T=P.autoReset,L=Nt.enabled,X=Nt.autoUpdate,H=Nt.needsUpdate,V=Nt.type;Rt(),P.autoReset=T,Nt.enabled=L,Nt.autoUpdate=X,Nt.needsUpdate=H,Nt.type=V}function Ai(T){Ut("WebGLRenderer: A WebGL context could not be created. Reason: ",T.statusMessage)}function ki(T){let L=T.target;L.removeEventListener("dispose",ki),hE(L)}function hE(T){fE(T),z.remove(T)}function fE(T){let L=z.get(T).programs;L!==void 0&&(L.forEach(function(X){lt.releaseProgram(X)}),T.isShaderMaterial&&lt.releaseShaderCache(T))}this.renderBufferDirect=function(T,L,X,H,V,mt){L===null&&(L=an);let xt=V.isMesh&&V.matrixWorld.determinantAffine()<0,pt=mE(T,L,X,H,V);x.setMaterial(H,xt);let Mt=X.index,Tt=1;if(H.wireframe===!0){if(Mt=J.getWireframeAttribute(X),Mt===void 0)return;Tt=2}let kt=X.drawRange,Jt=X.attributes.position,bt=kt.start*Tt,he=(kt.start+kt.count)*Tt;mt!==null&&(bt=Math.max(bt,mt.start*Tt),he=Math.min(he,(mt.start+mt.count)*Tt)),Mt!==null?(bt=Math.max(bt,0),he=Math.min(he,Mt.count)):Jt!=null&&(bt=Math.max(bt,0),he=Math.min(he,Jt.count));let Ye=he-bt;if(Ye<0||Ye===1/0)return;gt.setup(V,H,pt,X,Mt);let Ue,Me=ut;if(Mt!==null&&(Ue=ot.get(Mt),Me=K,Me.setIndex(Ue)),V.isMesh)H.wireframe===!0?(x.setLineWidth(H.wireframeLinewidth*st()),Me.setMode(N.LINES)):Me.setMode(N.TRIANGLES);else if(V.isLine){let En=H.linewidth;En===void 0&&(En=1),x.setLineWidth(En*st()),V.isLineSegments?Me.setMode(N.LINES):V.isLineLoop?Me.setMode(N.LINE_LOOP):Me.setMode(N.LINE_STRIP)}else V.isPoints?Me.setMode(N.POINTS):V.isSprite&&Me.setMode(N.TRIANGLES);if(V.isBatchedMesh)if(rt.get("WEBGL_multi_draw"))Me.renderMultiDraw(V._multiDrawStarts,V._multiDrawCounts,V._multiDrawCount);else{let En=V._multiDrawStarts,yt=V._multiDrawCounts,Dn=V._multiDrawCount,se=Mt?ot.get(Mt).bytesPerElement:1,di=z.get(H).currentProgram.getUniforms();for(let Xi=0;Xi<Dn;Xi++)di.setValue(N,"_gl_DrawID",Xi),Me.render(En[Xi]/se,yt[Xi])}else if(V.isInstancedMesh)Me.renderInstances(bt,Ye,V.count);else if(X.isInstancedBufferGeometry){let En=X._maxInstanceCount!==void 0?X._maxInstanceCount:1/0,yt=Math.min(X.instanceCount,En);Me.renderInstances(bt,Ye,yt)}else Me.render(bt,Ye)};function B_(T,L,X,H){I!==null&&T.isNodeMaterial&&I.setObject(H,T),ie===!0&&Ct.setState(T,X,!1),T.transparent===!0&&T.side===ds&&T.forceSinglePass===!1?(T.side=Fn,T.needsUpdate=!0,ou(T,L,H),T.side=Oa,T.needsUpdate=!0,ou(T,L,H),T.side=ds):ou(T,L,H)}this.compile=function(T,L,X=null){X===null&&(X=T),I!==null&&I.renderStart(T,L,X),A=ct.get(X),A.init(L),g.push(A),X.traverseVisible(function(V){V.isLight&&V.layers.test(L.layers)&&(A.pushLight(V),V.castShadow&&A.pushShadow(V))}),T!==X&&T.traverseVisible(function(V){V.isLight&&V.layers.test(L.layers)&&(A.pushLight(V),V.castShadow&&A.pushShadow(V))}),A.setupLights(),I!==null&&I.updateLights(A.state.lightsArray),oe=this.localClippingEnabled,ie=Ct.init(this.clippingPlanes,oe),ie===!0&&Ct.setGlobalState(this.clippingPlanes,L),I!==null&&Nt.render(A.state.shadowsArray,X,L);let H=new Set;return T.traverse(function(V){if(!(V.isMesh||V.isPoints||V.isLine||V.isSprite))return;let mt=V.material;if(mt)if(Array.isArray(mt))for(let xt=0;xt<mt.length;xt++){let pt=mt[xt];B_(pt,X,L,V),H.add(pt)}else B_(mt,X,L,V),H.add(mt)}),A=g.pop(),I!==null&&I.renderEnd(),H},this.compileAsync=function(T,L,X=null){let H=this.compile(T,L,X);return new Promise(V=>{function mt(){if(H.forEach(function(xt){let Mt=z.get(xt).currentProgram;(Mt===void 0||Mt.isReady())&&H.delete(xt)}),H.size===0){V(T);return}setTimeout(mt,10)}rt.get("KHR_parallel_shader_compile")!==null?mt():setTimeout(mt,10)})};let ip=null;function dE(T){ip&&ip(T)}function z_(){Fa.stop()}function F_(){Fa.start()}let Fa=new j1;Fa.setAnimationLoop(dE),typeof self<"u"&&Fa.setContext(self),this.setAnimationLoop=function(T){ip=T,Et.setAnimationLoop(T),T===null?Fa.stop():Fa.start()},Et.addEventListener("sessionstart",z_),Et.addEventListener("sessionend",F_),this.render=function(T,L){if(L!==void 0&&L.isCamera!==!0){Ut("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(U===!0)return;I!==null&&I.renderStart(T,L);let X=Et.enabled===!0&&Et.isPresenting===!0,H=b!==null&&(it===null||X)&&b.begin(R,it);if(T.matrixWorldAutoUpdate===!0&&T.updateMatrixWorld(),L.parent===null&&L.matrixWorldAutoUpdate===!0&&L.updateMatrixWorld(),Et.enabled===!0&&Et.isPresenting===!0&&(b===null||b.isCompositing()===!1)&&(Et.cameraAutoUpdate===!0&&Et.updateCamera(L),L=Et.getCamera()),T.isScene===!0&&T.onBeforeRender(R,T,L,it),A=ct.get(T,g.length),A.init(L),A.state.textureUnits=k.getTextureUnits(),g.push(A),Yt.multiplyMatrices(L.projectionMatrix,L.matrixWorldInverse),qt.setFromProjectionMatrix(Yt,Bi,L.reversedDepth),oe=this.localClippingEnabled,ie=Ct.init(this.clippingPlanes,oe),E=ft.get(T,C.length),E.init(),C.push(E),Et.enabled===!0&&Et.isPresenting===!0){let xt=R.xr.getDepthSensingMesh();xt!==null&&sp(xt,L,-1/0,R.sortObjects)}sp(T,L,0,R.sortObjects),E.finish(),I!==null&&I.updateLights(A.state.lightsArray),R.sortObjects===!0&&E.sort(vt,Ot),Te=Et.enabled===!1||Et.isPresenting===!1||Et.hasDepthSensing()===!1,Te&&zt.addToRenderList(E,T),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),ie===!0&&Ct.beginShadows();let V=A.state.shadowsArray;if(Nt.render(V,T,L),ie===!0&&Ct.endShadows(),(H&&b.hasRenderPass())===!1){let xt=E.opaque,pt=E.transmissive;if(A.setupLights(),L.isArrayCamera){let Mt=L.cameras;if(pt.length>0)for(let Tt=0,kt=Mt.length;Tt<kt;Tt++){let Jt=Mt[Tt];V_(xt,pt,T,Jt)}Te&&zt.render(T);for(let Tt=0,kt=Mt.length;Tt<kt;Tt++){let Jt=Mt[Tt];H_(E,T,Jt,Jt.viewport)}}else pt.length>0&&V_(xt,pt,T,L),Te&&zt.render(T),H_(E,T,L)}it!==null&&Z===0&&(k.updateMultisampleRenderTarget(it),k.updateRenderTargetMipmap(it)),H&&b.end(R),T.isScene===!0&&T.onAfterRender(R,T,L),gt.resetDefaultState(),W=-1,$=null,g.pop(),g.length>0?(A=g[g.length-1],k.setTextureUnits(A.state.textureUnits),ie===!0&&Ct.setGlobalState(R.clippingPlanes,A.state.camera)):A=null,C.pop(),C.length>0?E=C[C.length-1]:E=null,I!==null&&I.renderEnd()};function sp(T,L,X,H){if(T.visible===!1)return;if(T.layers.test(L.layers)){if(T.isGroup)X=T.renderOrder;else if(T.isLOD)T.autoUpdate===!0&&T.update(L);else if(T.isLightProbeGrid)A.pushLightProbeGrid(T);else if(T.isLight)A.pushLight(T),T.castShadow&&A.pushShadow(T);else if(T.isSprite){if(!T.frustumCulled||T.intersectsFrustum(qt)){H&&ke.setFromMatrixPosition(T.matrixWorld).applyMatrix4(Yt);let xt=j.update(T),pt=T.material;pt.visible&&E.push(T,xt,pt,X,ke.z,null,L)}}else if((T.isMesh||T.isLine||T.isPoints)&&(!T.frustumCulled||T.intersectsFrustum(qt))){let xt=j.update(T),pt=T.material;if(H&&(T.boundingSphere!==void 0?(T.boundingSphere===null&&T.computeBoundingSphere(),ke.copy(T.boundingSphere.center)):(xt.boundingSphere===null&&xt.computeBoundingSphere(),ke.copy(xt.boundingSphere.center)),ke.applyMatrix4(T.matrixWorld).applyMatrix4(Yt)),Array.isArray(pt)){let Mt=xt.groups;for(let Tt=0,kt=Mt.length;Tt<kt;Tt++){let Jt=Mt[Tt],bt=pt[Jt.materialIndex];bt&&bt.visible&&E.push(T,xt,bt,X,ke.z,Jt,L)}}else pt.visible&&E.push(T,xt,pt,X,ke.z,null,L)}}let mt=T.children;for(let xt=0,pt=mt.length;xt<pt;xt++)sp(mt[xt],L,X,H)}function H_(T,L,X,H){let{opaque:V,transmissive:mt,transparent:xt}=T;A.setupLightsView(X),ie===!0&&Ct.setGlobalState(R.clippingPlanes,X),H&&x.viewport(et.copy(H)),V.length>0&&ru(V,L,X),mt.length>0&&ru(mt,L,X),xt.length>0&&ru(xt,L,X),x.buffers.depth.setTest(!0),x.buffers.depth.setMask(!0),x.buffers.color.setMask(!0),x.setPolygonOffset(!1)}function V_(T,L,X,H){if((X.isScene===!0?X.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[H.id]===void 0){let bt=rt.has("EXT_color_buffer_half_float")||rt.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[H.id]=new Yn(1,1,{generateMipmaps:!0,type:bt?Vi:Jn,minFilter:Pa,samples:Math.max(4,w.samples),stencilBuffer:a,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:te.workingColorSpace})}let mt=A.state.transmissionRenderTarget[H.id],xt=H.viewport||et;mt.setSize(xt.z*R.transmissionResolutionScale,xt.w*R.transmissionResolutionScale);let pt=R.getRenderTarget(),Mt=R.getActiveCubeFace(),Tt=R.getActiveMipmapLevel();R.setRenderTarget(mt),R.getClearColor(ae),Wt=R.getClearAlpha(),Wt<1&&R.setClearColor(16777215,.5),R.clear(),Te&&zt.render(X);let kt=R.toneMapping;R.toneMapping=zi;let Jt=H.viewport;if(H.viewport!==void 0&&(H.viewport=void 0),A.setupLightsView(H),ie===!0&&Ct.setGlobalState(R.clippingPlanes,H),ru(T,X,H),k.updateMultisampleRenderTarget(mt),k.updateRenderTargetMipmap(mt),rt.has("WEBGL_multisampled_render_to_texture")===!1){let bt=!1;for(let he=0,Ye=L.length;he<Ye;he++){let Ue=L[he],{object:Me,geometry:En,material:yt,group:Dn}=Ue;if(yt.side===ds&&Me.layers.test(H.layers)){let se=yt.side;yt.side=Fn,yt.needsUpdate=!0,G_(Me,X,H,En,yt,Dn),yt.side=se,yt.needsUpdate=!0,bt=!0}}bt===!0&&(k.updateMultisampleRenderTarget(mt),k.updateRenderTargetMipmap(mt))}R.setRenderTarget(pt,Mt,Tt),R.setClearColor(ae,Wt),Jt!==void 0&&(H.viewport=Jt),R.toneMapping=kt}function ru(T,L,X){let H=L.isScene===!0?L.overrideMaterial:null;for(let V=0,mt=T.length;V<mt;V++){let xt=T[V],{object:pt,geometry:Mt,group:Tt}=xt,kt=xt.material;kt.allowOverride===!0&&H!==null&&(kt=H),pt.layers.test(X.layers)&&G_(pt,L,X,Mt,kt,Tt)}}function G_(T,L,X,H,V,mt){I!==null&&V.isNodeMaterial&&I.setObject(T,V),T.onBeforeRender(R,L,X,H,V,mt),T.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,T.matrixWorld),T.normalMatrix.getNormalMatrix(T.modelViewMatrix),V.onBeforeRender(R,L,X,H,T,mt),V.transparent===!0&&V.side===ds&&V.forceSinglePass===!1?(V.side=Fn,V.needsUpdate=!0,R.renderBufferDirect(X,L,H,V,T,mt),V.side=Oa,V.needsUpdate=!0,R.renderBufferDirect(X,L,H,V,T,mt),V.side=ds):R.renderBufferDirect(X,L,H,V,T,mt),T.onAfterRender(R,L,X,H,V,mt)}function ou(T,L,X){L.isScene!==!0&&(L=an);let H=z.get(T),V=A.state.lights,mt=A.state.shadowsArray,xt=V.state.version,pt=lt.getParameters(T,V.state,mt,L,X,A.state.lightProbeGridArray),Mt=lt.getProgramCacheKey(pt),Tt=H.programs;H.environment=T.isMeshStandardMaterial||T.isMeshLambertMaterial||T.isMeshPhongMaterial?L.environment:null,H.fog=L.fog;let kt=T.isMeshStandardMaterial||T.isMeshLambertMaterial&&!T.envMap||T.isMeshPhongMaterial&&!T.envMap;H.envMap=at.get(T.envMap||H.environment,kt),H.envMapRotation=H.environment!==null&&T.envMap===null?L.environmentRotation:T.envMapRotation,Tt===void 0&&(T.addEventListener("dispose",ki),Tt=new Map,H.programs=Tt);let Jt=Tt.get(Mt);if(Jt!==void 0){if(H.currentProgram===Jt&&H.lightsStateVersion===xt)return X_(T,pt),Jt}else pt.uniforms=lt.getUniforms(T),I!==null&&T.isNodeMaterial&&I.build(T,X,pt),T.onBeforeCompile(pt,R),Jt=lt.acquireProgram(pt,Mt),Tt.set(Mt,Jt),H.uniforms=pt.uniforms;let bt=H.uniforms;return(!T.isShaderMaterial&&!T.isRawShaderMaterial||T.clipping===!0)&&(bt.clippingPlanes=Ct.uniform),X_(T,pt),H.needsLights=_E(T),H.lightsStateVersion=xt,H.needsLights&&(bt.ambientLightColor.value=V.state.ambient,bt.lightProbe.value=V.state.probe,bt.sunLights.value=V.state.sun,bt.sunLightShadows.value=V.state.sunShadow,bt.directionalLights.value=V.state.directional,bt.directionalLightShadows.value=V.state.directionalShadow,bt.spotLights.value=V.state.spot,bt.spotLightShadows.value=V.state.spotShadow,bt.rectAreaLights.value=V.state.rectArea,bt.ltc_1.value=V.state.rectAreaLTC1,bt.ltc_2.value=V.state.rectAreaLTC2,bt.pointLights.value=V.state.point,bt.pointLightShadows.value=V.state.pointShadow,bt.hemisphereLights.value=V.state.hemi,bt.sunShadowMatrix.value=V.state.sunShadowMatrix,bt.sunShadowCascade.value=V.state.sunShadowCascade,bt.directionalShadowMatrix.value=V.state.directionalShadowMatrix,bt.spotLightMatrix.value=V.state.spotLightMatrix,bt.spotLightMap.value=V.state.spotLightMap,bt.pointShadowMatrix.value=V.state.pointShadowMatrix),H.lightProbeGrid=A.state.lightProbeGridArray.length>0,H.currentProgram=Jt,H.uniformsList=null,Jt}function k_(T){if(T.uniformsList===null){let L=T.currentProgram.getUniforms();T.uniformsList=rl.seqWithValue(L.seq,T.uniforms)}return T.uniformsList}function X_(T,L){let X=z.get(T);X.outputColorSpace=L.outputColorSpace,X.batching=L.batching,X.batchingColor=L.batchingColor,X.instancing=L.instancing,X.instancingColor=L.instancingColor,X.instancingMorph=L.instancingMorph,X.skinning=L.skinning,X.morphTargets=L.morphTargets,X.morphNormals=L.morphNormals,X.morphColors=L.morphColors,X.morphTargetsCount=L.morphTargetsCount,X.numClippingPlanes=L.numClippingPlanes,X.numIntersection=L.numClipIntersection,X.vertexAlphas=L.vertexAlphas,X.vertexTangents=L.vertexTangents,X.toneMapping=L.toneMapping}function pE(T,L){if(T.length===0)return null;if(T.length===1)return T[0].texture!==null?T[0]:null;y.setFromMatrixPosition(L.matrixWorld);for(let X=0,H=T.length;X<H;X++){let V=T[X];if(V.texture!==null&&V.boundingBox.containsPoint(y))return V}return null}function mE(T,L,X,H,V){L.isScene!==!0&&(L=an),k.resetTextureUnits();let mt=L.fog,xt=H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial?L.environment:null,pt=it===null?R.outputColorSpace:it.isXRRenderTarget===!0?it.texture.colorSpace:te.workingColorSpace,Mt=H.isMeshStandardMaterial||H.isMeshLambertMaterial&&!H.envMap||H.isMeshPhongMaterial&&!H.envMap,Tt=at.get(H.envMap||xt,Mt),kt=H.vertexColors===!0&&!!X.attributes.color&&X.attributes.color.itemSize===4,Jt=!!X.attributes.tangent&&(!!H.normalMap||H.anisotropy>0),bt=!!X.morphAttributes.position,he=!!X.morphAttributes.normal,Ye=!!X.morphAttributes.color,Ue=zi;H.toneMapped&&(it===null||it.isXRRenderTarget===!0)&&(Ue=R.toneMapping);let Me=X.morphAttributes.position||X.morphAttributes.normal||X.morphAttributes.color,En=Me!==void 0?Me.length:0,yt=z.get(H),Dn=A.state.lights;if(ie===!0&&(oe===!0||T!==$)){let we=T===$&&H.id===W;Ct.setState(H,T,we)}let se=!1;H.version===yt.__version?(yt.needsLights&&yt.lightsStateVersion!==Dn.state.version||yt.outputColorSpace!==pt||V.isBatchedMesh&&yt.batching===!1||!V.isBatchedMesh&&yt.batching===!0||V.isBatchedMesh&&yt.batchingColor===!0&&V._colorsTexture===null||V.isBatchedMesh&&yt.batchingColor===!1&&V._colorsTexture!==null||V.isInstancedMesh&&yt.instancing===!1||!V.isInstancedMesh&&yt.instancing===!0||V.isSkinnedMesh&&yt.skinning===!1||!V.isSkinnedMesh&&yt.skinning===!0||V.isInstancedMesh&&yt.instancingColor===!0&&V.instanceColor===null||V.isInstancedMesh&&yt.instancingColor===!1&&V.instanceColor!==null||V.isInstancedMesh&&yt.instancingMorph===!0&&V.morphTexture===null||V.isInstancedMesh&&yt.instancingMorph===!1&&V.morphTexture!==null||yt.envMap!==Tt||H.fog===!0&&yt.fog!==mt||yt.numClippingPlanes!==void 0&&(yt.numClippingPlanes!==Ct.numPlanes||yt.numIntersection!==Ct.numIntersection)||yt.vertexAlphas!==kt||yt.vertexTangents!==Jt||yt.morphTargets!==bt||yt.morphNormals!==he||yt.morphColors!==Ye||yt.toneMapping!==Ue||yt.morphTargetsCount!==En||!!yt.lightProbeGrid!=A.state.lightProbeGridArray.length>0)&&(se=!0):(se=!0,yt.__version=H.version);let di=yt.currentProgram;se===!0&&(di=ou(H,L,V),I&&H.isNodeMaterial&&I.onUpdateProgram(H,di,yt));let Xi=!1,Gs=!1,Er=!1,ve=di.getUniforms(),Xe=yt.uniforms;if(x.useProgram(di.program)&&(Xi=!0,Gs=!0,Er=!0),H.id!==W&&(W=H.id,Gs=!0),yt.needsLights){let we=pE(A.state.lightProbeGridArray,V);yt.lightProbeGrid!==we&&(yt.lightProbeGrid=we,Gs=!0)}if(Xi||$!==T){x.buffers.depth.getReversed()&&T.reversedDepth!==!0&&(T._reversedDepth=!0,T.updateProjectionMatrix()),ve.setValue(N,"projectionMatrix",T.projectionMatrix),ve.setValue(N,"viewMatrix",T.matrixWorldInverse);let Xs=ve.map.cameraPosition;Xs!==void 0&&Xs.setValue(N,_e.setFromMatrixPosition(T.matrixWorld)),w.logarithmicDepthBuffer&&ve.setValue(N,"logDepthBufFC",2/(Math.log(T.far+1)/Math.LN2)),(H.isMeshPhongMaterial||H.isMeshToonMaterial||H.isMeshLambertMaterial||H.isMeshBasicMaterial||H.isMeshStandardMaterial||H.isShaderMaterial)&&ve.setValue(N,"isOrthographic",T.isOrthographicCamera===!0),$!==T&&($=T,Gs=!0,Er=!0)}if(yt.needsLights&&(Dn.state.sunShadowMap.length>0&&ve.setValue(N,"sunShadowMap",Dn.state.sunShadowMap,k),Dn.state.directionalShadowMap.length>0&&ve.setValue(N,"directionalShadowMap",Dn.state.directionalShadowMap,k),Dn.state.spotShadowMap.length>0&&ve.setValue(N,"spotShadowMap",Dn.state.spotShadowMap,k),Dn.state.pointShadowMap.length>0&&ve.setValue(N,"pointShadowMap",Dn.state.pointShadowMap,k)),V.isSkinnedMesh){ve.setOptional(N,V,"bindMatrix"),ve.setOptional(N,V,"bindMatrixInverse");let we=V.skeleton;we&&(we.boneTexture===null&&we.computeBoneTexture(),ve.setValue(N,"boneTexture",we.boneTexture,k))}V.isBatchedMesh&&(ve.setOptional(N,V,"batchingTexture"),ve.setValue(N,"batchingTexture",V._matricesTexture,k),ve.setOptional(N,V,"batchingIdTexture"),ve.setValue(N,"batchingIdTexture",V._indirectTexture,k),ve.setOptional(N,V,"batchingColorTexture"),V._colorsTexture!==null&&ve.setValue(N,"batchingColorTexture",V._colorsTexture,k));let ks=X.morphAttributes;if((ks.position!==void 0||ks.normal!==void 0||ks.color!==void 0)&&O.update(V,X,di),(Gs||yt.receiveShadow!==V.receiveShadow)&&(yt.receiveShadow=V.receiveShadow,ve.setValue(N,"receiveShadow",V.receiveShadow)),(H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial)&&H.envMap===null&&L.environment!==null&&(Xe.envMapIntensity.value=L.environmentIntensity),Xe.dfgLUT!==void 0&&(Xe.dfgLUT.value=yD()),Gs){if(ve.setValue(N,"toneMappingExposure",R.toneMappingExposure),yt.needsLights&&gE(Xe,Er),mt&&H.fog===!0&&wt.refreshFogUniforms(Xe,mt),wt.refreshMaterialUniforms(Xe,H,tt,q,A.state.transmissionRenderTarget[T.id]),yt.needsLights&&yt.lightProbeGrid){let we=yt.lightProbeGrid;Xe.probesSH.value=we.texture,Xe.probesMin.value.copy(we.boundingBox.min),Xe.probesMax.value.copy(we.boundingBox.max),Xe.probesResolution.value.copy(we.resolution)}rl.upload(N,k_(yt),Xe,k)}if(H.isShaderMaterial&&H.uniformsNeedUpdate===!0&&(rl.upload(N,k_(yt),Xe,k),H.uniformsNeedUpdate=!1),H.isSpriteMaterial&&ve.setValue(N,"center",V.center),ve.setValue(N,"modelViewMatrix",V.modelViewMatrix),ve.setValue(N,"normalMatrix",V.normalMatrix),ve.setValue(N,"modelMatrix",V.matrixWorld),H.uniformsGroups!==void 0){let we=H.uniformsGroups;for(let Xs=0,Tr=we.length;Xs<Tr;Xs++){let q_=we[Xs];nt.update(q_,di),nt.bind(q_,di)}}return di}function gE(T,L){T.ambientLightColor.needsUpdate=L,T.lightProbe.needsUpdate=L,T.sunLights.needsUpdate=L,T.sunLightShadows.needsUpdate=L,T.directionalLights.needsUpdate=L,T.directionalLightShadows.needsUpdate=L,T.pointLights.needsUpdate=L,T.pointLightShadows.needsUpdate=L,T.spotLights.needsUpdate=L,T.spotLightShadows.needsUpdate=L,T.rectAreaLights.needsUpdate=L,T.hemisphereLights.needsUpdate=L}function _E(T){return T.isMeshLambertMaterial||T.isMeshToonMaterial||T.isMeshPhongMaterial||T.isMeshStandardMaterial||T.isShadowMaterial||T.isShaderMaterial&&T.lights===!0}this.getActiveCubeFace=function(){return Y},this.getActiveMipmapLevel=function(){return Z},this.getRenderTarget=function(){return it},this.setRenderTargetTextures=function(T,L,X){let H=z.get(T);H.__autoAllocateDepthBuffer=T.resolveDepthBuffer===!1,H.__autoAllocateDepthBuffer===!1&&(H.__useRenderToTexture=!1),z.get(T.texture).__webglTexture=L,z.get(T.depthTexture).__webglTexture=H.__autoAllocateDepthBuffer?void 0:X,H.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(T,L){let X=z.get(T);X.__webglFramebuffer=L,X.__useDefaultFramebuffer=L===void 0},this.setRenderTarget=function(T,L=0,X=0){it=T,Y=L,Z=X;let H=null,V=!1,mt=!1;if(T){let pt=z.get(T);if(pt.__useDefaultFramebuffer!==void 0){x.bindFramebuffer(N.FRAMEBUFFER,pt.__webglFramebuffer),et.copy(T.viewport),At.copy(T.scissor),St=T.scissorTest,x.viewport(et),x.scissor(At),x.setScissorTest(St),W=-1;return}else if(pt.__webglFramebuffer===void 0)k.setupRenderTarget(T);else if(pt.__hasExternalTextures)k.rebindTextures(T,z.get(T.texture).__webglTexture,z.get(T.depthTexture).__webglTexture);else if(T.depthBuffer){let kt=T.depthTexture;if(pt.__boundDepthTexture!==kt){if(kt!==null&&z.has(kt)&&(T.width!==kt.image.width||T.height!==kt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");k.setupDepthRenderbuffer(T)}}let Mt=T.texture;(Mt.isData3DTexture||Mt.isDataArrayTexture||Mt.isCompressedArrayTexture)&&(mt=!0);let Tt=z.get(T).__webglFramebuffer;T.isWebGLCubeRenderTarget?(Array.isArray(Tt[L])?H=Tt[L][X]:H=Tt[L],V=!0):T.samples>0&&k.useMultisampledRTT(T)===!1?H=z.get(T).__webglMultisampledFramebuffer:Array.isArray(Tt)?H=Tt[X]:H=Tt,et.copy(T.viewport),At.copy(T.scissor),St=T.scissorTest}else et.copy(_t).multiplyScalar(tt).floor(),At.copy(Gt).multiplyScalar(tt).floor(),St=Ge;if(X!==0&&(H=F),x.bindFramebuffer(N.FRAMEBUFFER,H)&&x.drawBuffers(T,H),x.viewport(et),x.scissor(At),x.setScissorTest(St),V){let pt=z.get(T.texture);N.framebufferTexture2D(N.FRAMEBUFFER,N.COLOR_ATTACHMENT0,N.TEXTURE_CUBE_MAP_POSITIVE_X+L,pt.__webglTexture,X)}else if(mt){let pt=L;for(let Mt=0;Mt<T.textures.length;Mt++){let Tt=z.get(T.textures[Mt]);N.framebufferTextureLayer(N.FRAMEBUFFER,N.COLOR_ATTACHMENT0+Mt,Tt.__webglTexture,X,pt)}}else if(T!==null&&X!==0){let pt=z.get(T.texture);N.framebufferTexture2D(N.FRAMEBUFFER,N.COLOR_ATTACHMENT0,N.TEXTURE_2D,pt.__webglTexture,X)}W=-1};function W_(T){let L=z.get(T);return(L.__readFormat!==T.format||L.__readType!==T.type)&&(L.__readFormat=T.format,L.__readType=T.type,L.__formatReadable=w.textureFormatReadable(T.format),L.__typeReadable=w.textureTypeReadable(T.type)),L}this.readRenderTargetPixels=function(T,L,X,H,V,mt,xt,pt=0){if(!(T&&T.isWebGLRenderTarget)){Ut("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Mt=z.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&xt!==void 0&&(Mt=Mt[xt]),Mt){x.bindFramebuffer(N.FRAMEBUFFER,Mt);try{let Tt=T.textures[pt],kt=Tt.format,Jt=Tt.type;T.textures.length>1&&N.readBuffer(N.COLOR_ATTACHMENT0+pt);let bt=W_(Tt);if(bt.__formatReadable===!1){Ut("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(bt.__typeReadable===!1){Ut("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}L>=0&&L<=T.width-H&&X>=0&&X<=T.height-V&&N.readPixels(L,X,H,V,ht.convert(kt),ht.convert(Jt),mt)}finally{let Tt=it!==null?z.get(it).__webglFramebuffer:null;x.bindFramebuffer(N.FRAMEBUFFER,Tt)}}},this.readRenderTargetPixelsAsync=async function(T,L,X,H,V,mt,xt,pt=0){if(!(T&&T.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Mt=z.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&xt!==void 0&&(Mt=Mt[xt]),Mt)if(L>=0&&L<=T.width-H&&X>=0&&X<=T.height-V){x.bindFramebuffer(N.FRAMEBUFFER,Mt);let Tt=T.textures[pt],kt=Tt.format,Jt=Tt.type;T.textures.length>1&&N.readBuffer(N.COLOR_ATTACHMENT0+pt);let bt=W_(Tt);if(bt.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(bt.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let he=N.createBuffer();N.bindBuffer(N.PIXEL_PACK_BUFFER,he),N.bufferData(N.PIXEL_PACK_BUFFER,mt.byteLength,N.STREAM_READ),N.readPixels(L,X,H,V,ht.convert(kt),ht.convert(Jt),0),N.bindBuffer(N.PIXEL_PACK_BUFFER,null);let Ye=it!==null?z.get(it).__webglFramebuffer:null;x.bindFramebuffer(N.FRAMEBUFFER,Ye);let Ue=N.fenceSync(N.SYNC_GPU_COMMANDS_COMPLETE,0);return N.flush(),await E1(N,Ue,4),N.bindBuffer(N.PIXEL_PACK_BUFFER,he),N.getBufferSubData(N.PIXEL_PACK_BUFFER,0,mt),N.bindBuffer(N.PIXEL_PACK_BUFFER,null),N.deleteBuffer(he),N.deleteSync(Ue),mt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(T,L=null,X=0){let H=Math.pow(2,-X),V=Math.floor(T.image.width*H),mt=Math.floor(T.image.height*H),xt=L!==null?L.x:0,pt=L!==null?L.y:0;k.setTexture2D(T,0),N.copyTexSubImage2D(N.TEXTURE_2D,X,0,0,xt,pt,V,mt),x.unbindTexture()},this.copyTextureToTexture=function(T,L,X=null,H=null,V=0,mt=0){let xt,pt,Mt,Tt,kt,Jt,bt,he,Ye,Ue=T.isCompressedTexture?T.mipmaps[mt]:T.image;if(X!==null)xt=X.max.x-X.min.x,pt=X.max.y-X.min.y,Mt=X.isBox3?X.max.z-X.min.z:1,Tt=X.min.x,kt=X.min.y,Jt=X.isBox3?X.min.z:0;else{let Xe=Math.pow(2,-V);xt=Math.floor(Ue.width*Xe),pt=Math.floor(Ue.height*Xe),T.isDataArrayTexture?Mt=Ue.depth:T.isData3DTexture?Mt=Math.floor(Ue.depth*Xe):Mt=1,Tt=0,kt=0,Jt=0}H!==null?(bt=H.x,he=H.y,Ye=H.z):(bt=0,he=0,Ye=0);let Me=ht.convert(L.format),En=ht.convert(L.type),yt;L.isData3DTexture?(k.setTexture3D(L,0),yt=N.TEXTURE_3D):L.isDataArrayTexture||L.isCompressedArrayTexture?(k.setTexture2DArray(L,0),yt=N.TEXTURE_2D_ARRAY):(k.setTexture2D(L,0),yt=N.TEXTURE_2D),x.activeTexture(N.TEXTURE0),x.pixelStorei(N.UNPACK_FLIP_Y_WEBGL,L.flipY),x.pixelStorei(N.UNPACK_PREMULTIPLY_ALPHA_WEBGL,L.premultiplyAlpha),x.pixelStorei(N.UNPACK_ALIGNMENT,L.unpackAlignment);let Dn=x.getParameter(N.UNPACK_ROW_LENGTH),se=x.getParameter(N.UNPACK_IMAGE_HEIGHT),di=x.getParameter(N.UNPACK_SKIP_PIXELS),Xi=x.getParameter(N.UNPACK_SKIP_ROWS),Gs=x.getParameter(N.UNPACK_SKIP_IMAGES);x.pixelStorei(N.UNPACK_ROW_LENGTH,Ue.width),x.pixelStorei(N.UNPACK_IMAGE_HEIGHT,Ue.height),x.pixelStorei(N.UNPACK_SKIP_PIXELS,Tt),x.pixelStorei(N.UNPACK_SKIP_ROWS,kt),x.pixelStorei(N.UNPACK_SKIP_IMAGES,Jt);let Er=T.isDataArrayTexture||T.isData3DTexture,ve=L.isDataArrayTexture||L.isData3DTexture;if(T.isDepthTexture){let Xe=z.get(T),ks=z.get(L),we=z.get(Xe.__renderTarget),Xs=z.get(ks.__renderTarget);x.bindFramebuffer(N.READ_FRAMEBUFFER,we.__webglFramebuffer),x.bindFramebuffer(N.DRAW_FRAMEBUFFER,Xs.__webglFramebuffer);for(let Tr=0;Tr<Mt;Tr++)Er&&(N.framebufferTextureLayer(N.READ_FRAMEBUFFER,N.COLOR_ATTACHMENT0,z.get(T).__webglTexture,V,Jt+Tr),N.framebufferTextureLayer(N.DRAW_FRAMEBUFFER,N.COLOR_ATTACHMENT0,z.get(L).__webglTexture,mt,Ye+Tr)),N.blitFramebuffer(Tt,kt,xt,pt,bt,he,xt,pt,N.DEPTH_BUFFER_BIT,N.NEAREST);x.bindFramebuffer(N.READ_FRAMEBUFFER,null),x.bindFramebuffer(N.DRAW_FRAMEBUFFER,null)}else if(V!==0||T.isRenderTargetTexture||z.has(T)){let Xe=z.get(T),ks=z.get(L);x.bindFramebuffer(N.READ_FRAMEBUFFER,D),x.bindFramebuffer(N.DRAW_FRAMEBUFFER,G);for(let we=0;we<Mt;we++)Er?N.framebufferTextureLayer(N.READ_FRAMEBUFFER,N.COLOR_ATTACHMENT0,Xe.__webglTexture,V,Jt+we):N.framebufferTexture2D(N.READ_FRAMEBUFFER,N.COLOR_ATTACHMENT0,N.TEXTURE_2D,Xe.__webglTexture,V),ve?N.framebufferTextureLayer(N.DRAW_FRAMEBUFFER,N.COLOR_ATTACHMENT0,ks.__webglTexture,mt,Ye+we):N.framebufferTexture2D(N.DRAW_FRAMEBUFFER,N.COLOR_ATTACHMENT0,N.TEXTURE_2D,ks.__webglTexture,mt),V!==0?N.blitFramebuffer(Tt,kt,xt,pt,bt,he,xt,pt,N.COLOR_BUFFER_BIT,N.NEAREST):ve?N.copyTexSubImage3D(yt,mt,bt,he,Ye+we,Tt,kt,xt,pt):N.copyTexSubImage2D(yt,mt,bt,he,Tt,kt,xt,pt);x.bindFramebuffer(N.READ_FRAMEBUFFER,null),x.bindFramebuffer(N.DRAW_FRAMEBUFFER,null)}else ve?T.isDataTexture||T.isData3DTexture?N.texSubImage3D(yt,mt,bt,he,Ye,xt,pt,Mt,Me,En,Ue.data):L.isCompressedArrayTexture?N.compressedTexSubImage3D(yt,mt,bt,he,Ye,xt,pt,Mt,Me,Ue.data):N.texSubImage3D(yt,mt,bt,he,Ye,xt,pt,Mt,Me,En,Ue):T.isDataTexture?N.texSubImage2D(N.TEXTURE_2D,mt,bt,he,xt,pt,Me,En,Ue.data):T.isCompressedTexture?N.compressedTexSubImage2D(N.TEXTURE_2D,mt,bt,he,Ue.width,Ue.height,Me,Ue.data):N.texSubImage2D(N.TEXTURE_2D,mt,bt,he,xt,pt,Me,En,Ue);x.pixelStorei(N.UNPACK_ROW_LENGTH,Dn),x.pixelStorei(N.UNPACK_IMAGE_HEIGHT,se),x.pixelStorei(N.UNPACK_SKIP_PIXELS,di),x.pixelStorei(N.UNPACK_SKIP_ROWS,Xi),x.pixelStorei(N.UNPACK_SKIP_IMAGES,Gs),mt===0&&L.generateMipmaps&&N.generateMipmap(yt),x.unbindTexture()},this.initRenderTarget=function(T){z.get(T).__webglFramebuffer===void 0&&k.setupRenderTarget(T)},this.initTexture=function(T){T.isCubeTexture?k.setTextureCube(T,0):T.isData3DTexture?k.setTexture3D(T,0):T.isDataArrayTexture||T.isCompressedArrayTexture?k.setTexture2DArray(T,0):k.setTexture2D(T,0),x.unbindTexture()},this.resetState=function(){Y=0,Z=0,it=null,x.reset(),gt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Bi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let n=this.getContext();n.drawingBufferColorSpace=te._getDrawingBufferColorSpace(t),n.unpackColorSpace=te._getUnpackColorSpace()}};var aE="",rE={feature:6514417,component:5799395,service:2282478,hook:10980346,page:15789719,doc:14802829,project:2278750,batch:16020150},au={building:15789719,verified:2278750,failed:15235577},P_=10134715,oE=3752796,lE=[{id:"telemetry",label:"TELEMETRY",color:5799395},{id:"ideas",label:"IDEAS",color:15789719},{id:"factory",label:"FACTORY",color:6514417},{id:"forge",label:"FORGE",color:14802829},{id:"artifacts",label:"ARTIFACTS",color:2278750}],ep=[-16,-8,0,8,16],Gi=new B(16,-.3,2.2),br=new B(-21,1.6,2.6),np=["plate","drum","ring","nozzle","core","bolt"];function cE(e,t,n,i){let s=new Ie({color:t,metalness:.62,roughness:.34,emissive:n,emissiveIntensity:i}),a;switch(e){case"drum":a=new Vt(new Zn(.33,.33,.5,18),s);break;case"ring":a=new Vt(new _r(.32,.12,12,26),s),a.rotation.x=Math.PI/2;break;case"nozzle":a=new Vt(new Ko(.3,.56,18),s);break;case"core":a=new Vt(new Bc(.36,0),s);break;case"bolt":a=new Vt(new Zn(.13,.13,.72,12),s);break;default:a=new Vt(new en(.62,.26,.62),s)}return a.userData.mat=s,a.scale.setScalar(1.25),a}function I_(e,t,n){let i=new Sn,s=new Ie({color:n,metalness:.78,roughness:.3,emissive:n,emissiveIntensity:.22}),a=new Vt(new Zn(e,e,t,24),s);a.rotation.x=Math.PI/2,i.add(a);let r=new Vt(new Zn(e*.32,e*.32,t*1.3,14),new Ie({color:P_,metalness:.85,roughness:.28}));r.rotation.x=Math.PI/2,i.add(r);for(let o=0;o<10;o++){let l=new Vt(new en(e*.26,t*1.02,e*.22),s),c=o/10*Math.PI*2;l.position.set(Math.cos(c)*e,Math.sin(c)*e,0),l.rotation.z=c,i.add(l)}return i}function SD(){let e=document.createElement("canvas");e.width=1024,e.height=256;let t=new Ic(e),n=new Nc(new Zo({map:t,transparent:!0,depthWrite:!1}));return n.scale.set(9,2.25,1),{spr:n,draw:(s,a)=>{let r=e.getContext("2d");r.clearRect(0,0,e.width,e.height),r.textAlign="center",r.fillStyle="rgba(255,255,255,.95)",r.font="600 74px JetBrains Mono, monospace",r.fillText(s,512,120),r.fillStyle="rgba(255,255,255,.5)",r.font="400 44px DM Sans, sans-serif",r.fillText(a,512,190),t.needsUpdate=!0}}}function MD({busRef:e}){let t=(0,qe.useRef)(null);(0,qe.useEffect)(()=>{let s=t.current,a;try{a=new jd({antialias:!0,alpha:!0})}catch{s.innerHTML='<div class="offline">3D pipeline disabled \u2014 WebGL unavailable in this browser</div>';return}a.setPixelRatio(Math.min(devicePixelRatio,2)),s.appendChild(a.domElement);let r=new Ac;r.fog=new Tc(658708,.01);let o=new xn(46,1,.1,400);o.position.set(0,7,25),o.lookAt(0,.8,0),r.add(new Xc(16777215,.72)),r.add(new Hc(9347839,658708,.65));let l=new kc(11187455,1.6);l.position.set(12,20,14),r.add(l);let c=new jo(14802829,1,100);c.position.set(-20,-4,14),r.add(c);let f=new jo(15789719,1.2,50);f.position.set(16,4,4),r.add(f);let p=new qc(160,80,2766160,1712432);p.position.y=-2.4,r.add(p);let u=new Wc,d=[],v=(st,N)=>d.push({t:u.getElapsed()+st,fn:N}),M=new Vt(new en(44,.7,4.4),new Ie({color:oE,metalness:.7,roughness:.4}));M.position.set(0,-1.9,0),r.add(M);let _=new Ie({color:3752794,metalness:.6,roughness:.5}),h=new en(1.4,.22,4),m=[];for(let st=0;st<30;st++){let N=new Vt(h,_);N.position.set(-22+st*1.5,-1.5,0),r.add(N),m.push(N)}let S={};lE.forEach((st,N)=>{let jt=new Sn;jt.position.set(ep[N],-.55,0),jt.add(new Vt(new en(3,1.9,2.4),new Ie({color:4016227,metalness:.7,roughness:.4})));let rt=new Vt(new _r(1.35,.09,14,60),new Ie({color:st.color,emissive:st.color,emissiveIntensity:.95}));rt.position.z=1.25,jt.add(rt);let w=I_(.85,.32,st.color);w.position.set(-.55,.05,1.35),jt.add(w);let x=I_(.5,.28,P_);x.position.set(.7,-.35,1.4),jt.add(x);let P=new Vt(new Qo(.16,16,16),new Ie({color:st.color,emissive:st.color,emissiveIntensity:1}));P.position.set(0,1.25,.4),jt.add(P);let z=new Sn,k=new Vt(new Zn(.09,.09,1.1,12),new Ie({color:P_,metalness:.9,roughness:.25}));k.position.y=.55,z.add(k);let at=new Vt(new Zn(.24,.24,.22,16),new Ie({color:st.color,emissive:st.color,emissiveIntensity:.35,metalness:.6}));at.position.y=1.12,z.add(at),z.position.set(0,1,-.4),jt.add(z),r.add(jt),S[st.id]={group:jt,gearBig:w,gearSmall:x,ring:rt,lamp:P,piston:z,pulse:0}});let y=new Ie({color:5858173,metalness:.8,roughness:.3}),E=new Sn;E.position.set(0,-.2,2.6),r.add(E);let A=new Vt(new Zn(.22,.3,1.4,16),y);A.position.y=.7,E.add(A);let C=new Sn;C.position.y=1.4,E.add(C);let g=new Vt(new en(.34,3,.34),y);g.position.y=1.5,C.add(g);let b=new Sn;b.position.y=3,C.add(b);let R=new Vt(new en(.26,2.2,.26),y);R.position.y=1.1,b.add(R);let U=new Vt(new Ko(.3,.6,12),new Ie({color:15789719,emissive:15789719,emissiveIntensity:.4,metalness:.6}));U.position.y=2.3,U.rotation.x=Math.PI,b.add(U);let I=new Vt(new en(.8,.3,2.2),new Ie({color:3094086,metalness:.6,roughness:.5}));I.position.set(-21.5,2.4,2.6),I.rotation.z=.5,r.add(I);let F=new Vt(new en(9,.4,4),new Ie({color:oE,metalness:.6,roughness:.5}));F.position.set(27,-1.6,0),r.add(F);let D={},G={};lE.forEach((st,N)=>{D[st.id]=0;let jt=new Vt(new en(1.9,2.6,.12),new Ie({color:2305086,transparent:!0,opacity:.55}));jt.position.set(ep[N],3.1,-.05),r.add(jt);let rt=new Vt(new en(1.7,1,.2),new Ie({color:st.color,emissive:st.color,emissiveIntensity:1.2}));rt.scale.y=.05,rt.position.set(ep[N],2.2,.05),r.add(rt),G[st.id]=rt});let Y=[],Z=new Ie({color:10404607,emissive:7311359,emissiveIntensity:1.2});for(let st=0;st<28;st++){let N=new Vt(new en(.34,.34,.34),Z);N.position.set(-22+st*1.6,-1.1,0),r.add(N),Y.push(N)}let it=I_(1.7,.45,7311359);it.position.set(-25,2.6,-3),r.add(it);let W=0,$=new Sn;$.position.copy(Gi),r.add($);let et=new Vt(new Zn(1.7,2,.4,28),new Ie({color:2831174,metalness:.7,roughness:.4}));et.position.y=-.5,$.add(et);let At=new Vt(new _r(1.75,.06,12,60),new Ie({color:2278750,emissive:2278750,emissiveIntensity:.5}));At.rotation.x=Math.PI/2,At.position.y=-.28,$.add(At);let St=SD();St.spr.position.set(Gi.x,3.9,Gi.z),r.add(St.spr),St.draw("line idle","awaiting the next build");let ae=[],Wt=[],ne=[],q=0,tt=st=>({x:Gi.x+(st%3-1)*.72,y:Gi.y-.2+Math.floor(st/3)*.6,z:Gi.z+(st%2?.4:-.4)}),vt=()=>{let st=q%5,N=Math.floor(q/5);return new B(24+st*1.4-2.8,-1.2+N*1.1,0)},Ot=(st,N,jt)=>{let rt=rE[st]??9741240,w=new Sn,x=Math.max(1,Math.min(6,jt||3));for(let P=0;P<x;P++){let z=cE(np[P%np.length],rt,N?au.verified:au.failed,.4);z.position.set((P%3-1)*.5,Math.floor(P/3)*.5,P%2?.3:-.3),w.add(z)}return w.position.copy(vt()),w.scale.setScalar(.9),r.add(w),ne.push(w),q++,w},_t=st=>{let N=S[st];N&&(N.pulse=1),st in D&&(D[st]=Math.min(1,D[st]+.6))},Gt=()=>{let st=new Vt(new Qo(.22,14,14),new Ie({color:15789719,emissive:15789719,emissiveIntensity:1}));st.position.copy(br),r.add(st),Wt.push({mesh:st,t:0})},Ge=(st,N,jt,rt,w)=>{if(w){Ot(st,N,jt);return}let x=rE[st]??9741240;St.draw(String(rt||st).slice(0,44),N?"assembling \xB7 verified":"assembling \xB7 failed");let P=Math.max(1,Math.min(12,jt||3));for(let z=0;z<P;z++)v(z*.16,()=>{let k=cE(np[z%np.length],x,au.building,.9);k.position.copy(br),r.add(k);let at=tt(z);ae.push({mesh:k,from:br.clone(),to:new B(at.x,at.y,at.z),t:0,done:!1})});v(P*.16+.9,()=>{let z=N?au.verified:au.failed;for(let k of ae){let at=k.mesh.userData.mat;at&&(at.emissive.setHex(z),at.emissiveIntensity=.55)}_t("artifacts")}),v(P*.16+1.9,()=>{let z=new Sn;for(let k of ae)k.mesh.position.set(k.to.x-Gi.x,k.to.y-Gi.y,k.to.z-Gi.z),z.add(k.mesh);z.position.copy(vt()),z.scale.setScalar(.9),r.add(z),ne.push(z),q++,ae.length=0,St.draw("line idle","awaiting the next build")})},qt=()=>{let st=new Vt(new Zn(1.1,1.1,.3,24),new Ie({color:14802829,emissive:14802829,emissiveIntensity:.6,metalness:.6}));st.position.set(Gi.x,6.5,Gi.z),r.add(st),v(.35,()=>{st.position.y=1.2}),v(.9,()=>{st.position.y=6.5}),v(1.5,()=>{r.remove(st),st.geometry.dispose(),st.material.dispose()})},ie=st=>{W=Math.max(0,Math.min(1,Number(st)||0))};e.current={pulse:_t,feed:Gt,assemble:Ge,stamp:qt,setLoad:ie};let oe={x:0,y:0},Yt=st=>{oe.x=st.clientX/innerWidth-.5,oe.y=st.clientY/innerHeight-.5};addEventListener("pointermove",Yt);let _e=()=>{let st=s.clientWidth,N=s.clientHeight;!st||!N||(a.setSize(st,N),o.aspect=st/N,o.updateProjectionMatrix())};_e();let ke=new ResizeObserver(_e);ke.observe(s);let an,Te=()=>{u.update();let st=Math.min(.05,u.getDelta()),N=u.getElapsed();for(let rt in S){let w=S[rt];w.gearBig.rotation.z+=st*1.3,w.gearSmall.rotation.z-=st*1.9,w.piston.position.y=1+Math.sin(N*3+w.group.position.x)*.22,w.pulse>0?(w.pulse=Math.max(0,w.pulse-st*1.6),w.ring.material.emissiveIntensity=.7+w.pulse*2.2,w.lamp.material.emissiveIntensity=1+w.pulse*2.5,w.group.scale.setScalar(1+w.pulse*.16)):w.group.scale.setScalar(1)}let jt=2.5+W*9;for(let rt of m)rt.position.x+=st*(1.5+W*3),rt.position.x>22&&(rt.position.x-=45);for(let rt of Y)rt.position.x+=st*jt,rt.position.x>22&&(rt.position.x-=44),rt.rotation.y+=st*3;it.rotation.z+=st*(.6+W*7);for(let rt in D){D[rt]=Math.max(0,D[rt]-st*.35);let w=G[rt],x=.05+D[rt]*2.4;w.scale.y=x,w.position.y=2.2+x/2,w.material.emissiveIntensity=.5+D[rt]*1.6}E.rotation.y=Math.sin(N*.8)*.6,C.rotation.x=-.5+Math.sin(N*1.1)*.35,b.rotation.x=.7+Math.sin(N*1.1+.6)*.5;for(let rt of ae){if(rt.done)continue;rt.t=Math.min(1,rt.t+st/.75);let w=rt.t<.5?2*rt.t*rt.t:1-Math.pow(-2*rt.t+2,2)/2;rt.mesh.position.set(rt.from.x+(rt.to.x-rt.from.x)*w,rt.from.y+(rt.to.y-rt.from.y)*w+Math.sin(w*Math.PI)*2.2,rt.from.z+(rt.to.z-rt.from.z)*w),rt.mesh.rotation.x+=st*4,rt.mesh.rotation.y+=st*3,rt.t>=1&&(rt.done=!0,rt.mesh.rotation.set(0,0,0))}for(let rt=Wt.length-1;rt>=0;rt--){let w=Wt[rt];w.t=Math.min(1,w.t+st/1.6),w.mesh.position.set(br.x+(ep[2]-br.x)*w.t,br.y-w.t*3,br.z-w.t*2.6),w.mesh.material.emissiveIntensity=1-w.t*.5,w.t>=1&&(r.remove(w.mesh),w.mesh.geometry.dispose(),w.mesh.material.dispose(),Wt.splice(rt,1))}for(let rt=d.length-1;rt>=0;rt--)if(N>=d[rt].t){let w=d[rt].fn;d.splice(rt,1);try{w()}catch{}}o.position.x+=(oe.x*3-o.position.x)*.03,o.position.y+=(7-oe.y*2-o.position.y)*.03,o.lookAt(0,.8,0),a.render(r,o),an=requestAnimationFrame(Te)};return an=requestAnimationFrame(Te),()=>{cancelAnimationFrame(an),ke.disconnect(),removeEventListener("resize",_e),removeEventListener("pointermove",Yt),a.dispose(),s.innerHTML=""}},[e]);let n=qe.default.createElement,i=[["feature","#6366f1"],["component","#587de3"],["service","#22d3ee"],["doc","#e1df8d"],["project","#22c55e"]];return n("div",{className:"canvas-wrap"},n("div",{id:"scene",ref:t}),n("div",{className:"hud"},n("div",{className:"hud-title"},"assembly line \xB7 the tool under construction"),n("div",{className:"legend"},i.map(([s,a])=>n("span",{key:s,className:"lg"},n("i",{style:{background:a}}),s)),n("span",{className:"lg sep"},n("i",{style:{background:"#f0ee97"}}),"building"),n("span",{className:"lg"},n("i",{style:{background:"#22c55e"}}),"verified"),n("span",{className:"lg"},n("i",{style:{background:"#e879f9"}}),"failed"))))}function bD(){let e=(0,qe.useRef)(null),[t,n]=(0,qe.useState)(null),[i,s]=(0,qe.useState)([]),[a,r]=(0,qe.useState)(!1),[o,l]=(0,qe.useState)(0),[c,f]=(0,qe.useState)(Date.now()),p=(0,qe.useRef)(new Set),u=b=>{!b||p.current.has(b.seq)||(p.current.add(b.seq),s(R=>[b,...R].slice(0,200)),l(R=>Math.max(R,b.at||0)))},d=()=>fetch(aE+"/api/recourse/factory/state").then(b=>b.json()).then(b=>{n(b),(b.events??[]).forEach(u),(b.artifacts??[]).forEach(R=>e.current?.assemble(R.kind,R.verification?.ok!==!1,(R.files||[]).length,R.id,!0))}).catch(()=>{});(0,qe.useEffect)(()=>{d();let b=new EventSource(aE+"/api/recourse/factory/stream");b.addEventListener("hello",()=>r(!0)),b.addEventListener("factory",I=>{let F=JSON.parse(I.data);u(F);let D=e.current;D&&(F.type==="idea.consumed"?(D.pulse("ideas"),D.feed(),D.pulse(F.detail?.lane==="factory"?"factory":"forge")):F.type==="artifact.built"||F.type==="artifact.failed"?(D.pulse("factory"),D.assemble(F.detail.kind,F.type==="artifact.built",F.detail.files??4,F.detail.id)):F.type==="science.logged"&&D.stamp())}),b.onerror=()=>r(!1);let R=setInterval(d,4e3),U=setInterval(()=>f(Date.now()),1e3);return()=>{b.close(),clearInterval(R),clearInterval(U)}},[]);let v=t?.totals??{},M=t?.artifacts??[],_=t?.extra?.jobs??[],h=t?.engine??{},m=o?Math.max(0,Math.round((c-o)/1e3)):null,S=m!=null&&m<=15,y=(0,qe.useMemo)(()=>{let U=c-12e4,I=new Array(30).fill(0);for(let F of i){let D=Math.floor(((F.at||0)-U)/4e3);D>=0&&D<30&&I[D]++}return I},[i,c]),E=(0,qe.useMemo)(()=>i.filter(b=>(b.at||0)>c-6e4).length,[i,c]);(0,qe.useEffect)(()=>{e.current?.setLoad(Math.min(1,E/12))},[E]);let A=_.find(b=>(b.skipCount||0)>0&&b.runCount===b.skipCount),C=b=>new Date(b).toLocaleTimeString([],{hour12:!1}),g=qe.default.createElement;return g("div",{className:"app"},g("header",{className:"bar"},g("div",{className:"brand"},g("h1",null,"Recourse \xB7 Software Factory"),g("small",null,"deterministic scaffold + verified generation")),g("div",{className:"spacer"}),g("span",{className:"chip"},g("span",{className:`dot ${a?"on pulse":"off"}`}),a?"stream live":"stream down"),g("span",{className:"chip"},g("span",{className:`dot ${S?"on pulse":"off"}`}),S?"working":"idle"),g("span",{className:"chip"},"engine "+(h.available?"live":"offline")),g("span",{className:"chip"},"artifacts "+(v.artifacts??0)),g("span",{className:"chip"},"files "+(v.files??0)),g("span",{className:"chip"},"verified "+(v.verified??0)),g("span",{className:"chip"},m==null?"no events yet":`last event ${m}s ago`)),g("div",{className:`banner ${S?"working":"idle"}`},g("span",{className:"state"},g("span",{className:`dot ${S?"on pulse":"off"}`}),S?"WORKING":"IDLE"),g("span",{className:"why"},S?`processing \xB7 ${E} events/min \xB7 ${v.built??0} built`:A?`idle \u2014 loop "${A.id}" skipping ${A.skipCount}\xD7: ${String(A.detail||A.lastOutcome||"").slice(0,64)}`:"idle \u2014 awaiting a trigger (POST /factory/scaffold)"),g("span",{className:"spark"},y.map((b,R)=>g("i",{key:R,style:{height:Math.min(100,8+b*26)+"%",opacity:b?.95:.16}})))),g("div",{className:"grid"},g("section",{className:"panel"},g("h2",null,"Assembly line \xB7 live"),g(MD,{busRef:e})),g("section",{className:"panel"},g("h2",null,`Live event feed \xB7 ${i.length}`),g("div",{className:"feed"},i.length===0?g("div",{className:"muted",style:{padding:"10px"}},"no events yet \u2014 trigger a build to see the line run"):i.slice(0,80).map(b=>g("div",{className:"ev",key:b.seq},g("span",{className:"t"},C(b.at)),g("span",{className:`k ${b.type.replace("."," ")}`},b.type),g("span",{className:"d"},JSON.stringify(b.detail).slice(0,90))))))),g("div",{className:"cols"},g("section",{className:"panel"},g("h2",null,"Artifacts \xB7 deterministic builds"),g("div",{className:"scroll"},g("table",null,g("thead",null,g("tr",null,["id","kind","files","verified","at"].map(b=>g("th",{key:b},b)))),g("tbody",null,M.slice().reverse().map((b,R)=>g("tr",{key:b.id+":"+R},g("td",null,b.id),g("td",null,b.kind),g("td",null,(b.files||[]).length),g("td",{className:b.verification?.ok===!0?"ok":b.verification?.ok===!1?"bad":"warn"},String(b.verification?.ok??"\u2014")),g("td",null,C(b.at)))))))),g("section",{className:"panel"},g("h2",null,"Processes \xB7 self-feeding loops"),g("div",{className:"scroll"},_.map(b=>g("div",{key:b.id,className:"proc"},g("span",{className:"nm"},b.id),g("span",{className:b.skipCount>0&&b.runCount===b.skipCount?"skip":"run"},`runs ${b.runCount} \xB7 skips ${b.skipCount}`),g("span",{className:"oc"},b.lastOutcome??"\u2014"),g("span",{className:"det"},b.detail?String(b.detail):""))),g("div",{className:"proc"},g("span",{className:"nm"},"ideas"),g("span",{className:"muted"},`${t?.extra?.ideas?.built??0}/${t?.extra?.ideas?.total??0} built`),g("span",{className:"muted"},"registry "+(t?.extra?.registry?.tools??"\u2014")),g("span",{className:"det"},""))))))}(0,uE.createRoot)(document.getElementById("root")).render(qe.default.createElement(bD));})();
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.js:
  (**
   * @license React
   * scheduler.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.js:
  (**
   * @license React
   * react-dom.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom-client.production.js:
  (**
   * @license React
   * react-dom-client.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
