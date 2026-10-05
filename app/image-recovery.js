const bound = new WeakSet();
export function bindImageRecovery(root) {
  if (bound.has(root)) return;
  bound.add(root);
  root.addEventListener('error', event => {
    const image=event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const container=image.closest('.photo-card,.work-opening');
    if (!container || container.querySelector('.photo-error')) return;
    image.hidden=true;
    const button=image.closest('button'); if(button) button.disabled=true;
    container.classList.add('has-image-error');
    const message=document.createElement('div');message.className='photo-error';message.setAttribute('role','status');
    message.textContent='This photograph could not be loaded.';
    const retry=document.createElement('button');retry.textContent='Try again';
    retry.onclick=()=>{
      message.remove();container.classList.remove('has-image-error');image.hidden=false;if(button)button.disabled=false;
      const source=image.getAttribute('src'), sourceSet=image.getAttribute('srcset');
      image.removeAttribute('src');image.removeAttribute('srcset');
      if(sourceSet)image.setAttribute('srcset',sourceSet);image.setAttribute('src',source);
    };
    message.append(retry);container.append(message);
  },true);
  root.addEventListener('load',event=>{
    if (!(event.target instanceof HTMLImageElement)) return;
    const container=event.target.closest('.photo-card,.work-opening');
    container?.querySelector('.photo-error')?.remove();container?.classList.remove('has-image-error');
    event.target.hidden=false;const button=event.target.closest('button');if(button)button.disabled=false;
  },true);
}
