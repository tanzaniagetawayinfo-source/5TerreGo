(function(){
  if(window.__FTG_SITE_ANALYTICS__) return;
  window.__FTG_SITE_ANALYTICS__ = true;
  if(/^localhost$|^127\./.test(location.hostname)) return;
  try {
    var img = new Image();
    img.src = 'https://jpflcbktcnhmlvaibzcw.supabase.co/functions/v1/site-visit?page_path=' + encodeURIComponent(location.pathname || '/') + '&page_title=' + encodeURIComponent(document.title || '') + '&ts=' + Date.now();
  } catch (e) {}
})();