// App instalável: liga o modo app (sw.js) e mostra o botão "Instalar app".
(function () {
  const bt = document.getElementById('instalar');
  const dica = document.getElementById('dicaIphone');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js');
  }

  // Já aberto como app instalado: não mostra o botão.
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

  // Android, Windows, Mac (Chrome/Edge): o navegador avisa que dá para instalar.
  let pedido = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    pedido = e;
    bt.classList.remove('oculto');
  });
  window.addEventListener('appinstalled', () => {
    bt.classList.add('oculto');
    dica.classList.add('oculto');
  });

  // iPhone/iPad: não tem instalação automática; o botão mostra como fazer.
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iphone) bt.classList.remove('oculto');

  bt.addEventListener('click', async () => {
    if (pedido) {
      pedido.prompt();
      await pedido.userChoice;
      pedido = null;
      bt.classList.add('oculto');
    } else {
      dica.classList.toggle('oculto');
    }
  });
})();
