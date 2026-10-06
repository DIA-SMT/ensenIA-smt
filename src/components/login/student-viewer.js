import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {renderScale} from './render-quality.js';

export function createStudent(host,{onReady=()=>{},onError=()=>{},framing='full'}={}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.1;host.appendChild(renderer.domElement);
 const gl=renderer.getContext(),renderLimit=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.5,.5,1,-1,.01,10);
 scene.add(new THREE.HemisphereLight(0xfff5e7,0x737f91,1.25));
 for(const [color,power,x,y,z] of [[0xffeddb,2.3,-2,4,3],[0xdde9ff,1.05,2,2,2],[0xffffff,1.1,1,3,-2]]){const l=new THREE.DirectionalLight(color,power);l.position.set(x,y,z);scene.add(l);}
 const poses={neutral:{yaw:0,pitch:0,eyeX:0,eyeY:0,peek:0,smile:0,surprise:0,close:0},username:{yaw:-6.8,pitch:.8,eyeX:-.38,eyeY:.07,peek:0,smile:1,surprise:0,close:0},password:{yaw:30,pitch:3,eyeX:0,eyeY:0,peek:0,smile:.15,surprise:0,close:1},surprise:{yaw:20,pitch:1,eyeX:-.8,eyeY:.05,peek:0,smile:0,surprise:.85,close:0},wink:{yaw:0,pitch:0,eyeX:0,eyeY:0,peek:0,smile:.65,surprise:0,close:0}};
 const current={...poses.neutral,wink:0,gesture:0};let root,pivot,neck,neckBase,neckNormals,neckWeights,neckToWorld,neckFromWorld,normalToWorld,normalFromWorld;
 let rejectionAt=-100,passwordVisible=false;
 let pose='neutral',time=0,last=0,winkAt=-100,raf=0,angle=0,hold=false,disposed=false,pointerX=0,pointerY=0,pointerActive=false;
 const morphs=[],point=new THREE.Vector3(),center=new THREE.Vector3(),q=new THREE.Quaternion(),identity=new THREE.Quaternion(),eyeAnchor=new THREE.Vector3(0,1.594,0),projectedEyeAnchor=new THREE.Vector3();
 const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
 function weight(mesh,name,value){const i=mesh.morphTargetDictionary?.[name];if(i!==undefined)mesh.morphTargetInfluences[i]=value;}
 function resize(){clearPointer();const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const span=1.055,cy=1.425;camera.position.set(Math.sin(angle)*3,cy,Math.cos(angle)*3);camera.lookAt(0,cy,0);camera.left=-span*w/h/2;camera.right=-camera.left;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setDrawingBufferSize(w,h,renderScale(w,h,window.devicePixelRatio,renderLimit));}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 // Moving the window between monitors can change pixel density without resizing the host.
 let densityQuery;
 function watchDensity(){densityQuery?.removeEventListener('change',densityChanged);densityQuery=matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);densityQuery.addEventListener('change',densityChanged);}
 function densityChanged(){resize();watchDensity();}
 watchDensity();
 function updateNeck(){
  if(!neckBase)return;const position=neck.geometry.attributes.position,normal=neck.geometry.attributes.normal;
  for(let i=0;i<position.count;i++){point.fromArray(neckBase,i*3).applyMatrix4(neckToWorld).sub(center);q.copy(identity).slerp(pivot.quaternion,neckWeights[i]);point.applyQuaternion(q).add(center).applyMatrix4(neckFromWorld);position.setXYZ(i,point.x,point.y,point.z);point.fromArray(neckNormals,i*3).applyMatrix3(normalToWorld).normalize().applyQuaternion(q).applyMatrix3(normalFromWorld).normalize();normal.setXYZ(i,point.x,point.y,point.z);}
  position.needsUpdate=true;normal.needsUpdate=true;
 }
 function frame(now){raf=0;if(document.hidden||disposed)return;const dt=Math.min((now-(last||now))/1000,.05);last=now;time+=dt;
  const rejectionTime=time-rejectionAt,rejecting=rejectionTime>=0&&rejectionTime<1.5;
  const target={...poses[pose]};if(!rejecting&&((pose==='neutral'||(pose==='username'&&pointerActive)))&&!reduced.matches){target.yaw=pointerX*11;target.pitch=pointerY*6;target.eyeX=pointerX*.60;target.eyeY=pointerY*.48;}
  // A finite gesture takes priority over the pointer and the submit wink.
  if(rejecting)Object.assign(target,{yaw:0,pitch:1,eyeX:0,eyeY:0,smile:.12,surprise:0,close:passwordVisible?0:1});
  const shakeProgress=THREE.MathUtils.clamp((rejectionTime-.20)/1.15,0,1);
  const shake=rejecting&&!reduced.matches?11*Math.sin(shakeProgress*Math.PI*4)*Math.sin(shakeProgress*Math.PI)**2:0;
  for(const key of Object.keys(target)){const speed=key==='close'?15:key.startsWith('eye')?14:5.5;current[key]+=(target[key]-current[key])*(reduced.matches?1:1-Math.exp(-speed*dt));}
  const wt=time-winkAt;let w=0,g=0;if(!rejecting&&pose==='wink'){if(hold){w=g=1;}else{w=smooth((wt-.12)/.18)*(1-smooth((wt-.48)/.27));g=smooth(wt/.27)*(1-smooth((wt-.60)/.48));}}
  current.wink+=(w-current.wink)*(1-Math.exp(-26*dt));current.gesture+=(g-current.gesture)*(1-Math.exp(-15*dt));
  const bt=time%5.1;const blink=!rejecting&&!reduced.matches&&pose==='neutral'&&bt>3.7&&bt<4?Math.sin((bt-3.7)/.3*Math.PI):0;
  if(pivot){pivot.rotation.set(THREE.MathUtils.degToRad(current.pitch-2.2*current.gesture),THREE.MathUtils.degToRad(current.yaw+shake-3.5*current.gesture),THREE.MathUtils.degToRad(-3*current.gesture));updateNeck();}
  for(const m of morphs){const rightEye=m.name.endsWith('_R');weight(m,'blink',Math.max(current.close,blink,rightEye?current.wink:0));weight(m,'smile',current.smile);weight(m,'surprise',current.surprise);weight(m,'wink_detail',current.gesture);weight(m,'peek',current.peek);weight(m,'look_left',Math.max(0,-current.eyeX));weight(m,'look_right',Math.max(0,current.eyeX));weight(m,'look_up',Math.max(0,-current.eyeY));weight(m,'look_down',Math.max(0,current.eyeY));}
  if(root)root.position.y=0;
  renderer.render(scene,camera);raf=requestAnimationFrame(frame);
 }
 function visibility(){cancelAnimationFrame(raf);last=0;clearPointer();if(!document.hidden&&!disposed)raf=requestAnimationFrame(frame);}
 document.addEventListener('visibilitychange',visibility);
 const draco=new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}migue-login/v1/draco/`).setWorkerLimit(1);
 new GLTFLoader().setDRACOLoader(draco).load(`${import.meta.env.BASE_URL}migue-login/v1/migue-estudiante.glb?uniforme=v13`,gltf=>{
  if(disposed){disposeModel(gltf.scene);return;}root=gltf.scene;pivot=root.getObjectByName('HeadPivot');root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=THREE.DoubleSide;o.frustumCulled=false;if(o.morphTargetInfluences){o.morphTargetInfluences.fill(0);morphs.push(o);}if(o.morphTargetDictionary?.yaw_left!==undefined)neck=o;}});
  if(neck&&pivot){neck.geometry=neck.geometry.clone();neckBase=neck.geometry.attributes.position.array.slice();neckNormals=neck.geometry.attributes.normal.array.slice();neckWeights=new Float32Array(neckBase.length/3);neckToWorld=neck.matrixWorld.clone();neckFromWorld=neckToWorld.clone().invert();normalToWorld=new THREE.Matrix3().getNormalMatrix(neckToWorld);normalFromWorld=new THREE.Matrix3().getNormalMatrix(neckFromWorld);pivot.getWorldPosition(center);for(let i=0;i<neckWeights.length;i++){point.fromArray(neckBase,i*3).applyMatrix4(neckToWorld);neckWeights[i]=smooth((point.y-1.36)/.029);}}
  // Project the actual neutral iris centers; never use a guessed percentage of the torso.
  const irises=morphs.filter(m=>m.name.includes('Iris'));
  if(irises.length){eyeAnchor.set(0,0,0);for(const iris of irises){const box=new THREE.Box3().setFromBufferAttribute(iris.geometry.attributes.position);box.getCenter(point).applyMatrix4(iris.matrixWorld);eyeAnchor.add(point);}eyeAnchor.multiplyScalar(1/irises.length);}
  const textures=new Set();
  root.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(material))if(value?.isTexture)textures.add(value);});
  for(const texture of textures){texture.anisotropy=anisotropy;texture.needsUpdate=true;}
  scene.add(root);onReady();raf=requestAnimationFrame(frame);
 },undefined,error=>{if(!disposed){console.error('Migue no disponible',error);onError();}});
 function clearPointer(){pointerX=pointerY=0;pointerActive=false;host.dataset.gaze='rest';}
 function trackPointer(clientX,clientY){
  const rect=host.getBoundingClientRect();if(!rect.width||!rect.height){clearPointer();return;}
  camera.updateMatrixWorld();projectedEyeAnchor.copy(eyeAnchor).project(camera);
  const originX=rect.left+(projectedEyeAnchor.x+1)*rect.width/2;
  const originY=rect.top+(1-projectedEyeAnchor.y)*rect.height/2;
  const reach=Math.max(110,rect.height*.60);
  const dx=(clientX-originX)/reach,dy=(clientY-originY)/reach;
  const radius=Math.max(1,Math.hypot(dx,dy));
  pointerX=dx/radius;pointerY=dy/radius;pointerActive=true;host.dataset.gaze=JSON.stringify({x:+pointerX.toFixed(3),y:+pointerY.toFixed(3),originX:+originX.toFixed(1),originY:+originY.toFixed(1)});
 }
 function disposeModel(model){model?.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}});}
 return {trackPointer,clearPointer,setPasswordVisible(visible){passwordVisible=visible;},reject(){rejectionAt=time;winkAt=-100;current.wink=current.gesture=0;},setPose(name){if(poses[name]){pose=name;winkAt=time;}},setPointer(x,y){pointerActive=true;pointerX=THREE.MathUtils.clamp(x,-1,1);pointerY=THREE.MathUtils.clamp(y,-1,1);},setView(value){angle=THREE.MathUtils.degToRad(value);resize();},setFraming(value){framing=value;resize();},setHold(value){hold=value;winkAt=time;},dispose(){disposed=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);observer.disconnect();densityQuery?.removeEventListener('change',densityChanged);draco.dispose();disposeModel(root);renderer.dispose();renderer.domElement.remove();}};
}
