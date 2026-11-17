document.addEventListener('click', function (event) {
  const link=event.target.closest('a[href]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const target=new URL(link.href,location.href);
  if (target.origin===location.origin && target.pathname!==location.pathname) {
    event.preventDefault();event.stopImmediatePropagation();location.assign(target.href);
  }
},true);
