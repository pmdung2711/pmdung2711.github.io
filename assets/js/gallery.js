// Gallery: renders albums from data/gallery.json (Google Drive file IDs).
// gallery.html            → album shelf
// gallery.html?album=slug → one album's photos/videos + lightbox
(function () {
  var grid = document.getElementById('gallery-grid');
  var filterBar = document.getElementById('filters');
  var filters = filterBar.querySelectorAll('.chip');
  var title = document.getElementById('gallery-title');
  var lead = document.getElementById('gallery-lead');
  var back = document.getElementById('album-back');
  var box = document.getElementById('lightbox');
  var stage = box.querySelector('.lightbox-stage');
  var items = [];
  var visible = [];
  var current = 0;

  function thumb(id, size) {
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + size;
  }

  function slugify(text) {
    return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function countLabel(list) {
    var photos = list.filter(function (it) { return it.type !== 'video'; }).length;
    var videos = list.length - photos;
    var parts = [];
    if (photos) parts.push(plural(photos, 'photo'));
    if (videos) parts.push(plural(videos, 'video'));
    return parts.join(' · ') || 'empty for now';
  }

  function showState(message, link) {
    grid.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'state';
    div.style.gridColumn = '1 / -1';
    div.innerHTML = '<img src="assets/img/cats/cat-sleeping.svg" alt="">';
    var p = document.createElement('p');
    p.textContent = message + ' ';
    if (link) {
      var a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      p.appendChild(a);
    }
    div.appendChild(p);
    grid.appendChild(div);
  }

  // ----- Album shelf -----
  function renderAlbums(albums) {
    grid.className = 'grid albums';
    if (!albums.length) {
      showState('No albums yet. The cat is still taking pictures.');
      return;
    }
    grid.innerHTML = '';
    albums.forEach(function (album) {
      var a = document.createElement('a');
      a.className = 'album';
      a.href = 'gallery.html?album=' + encodeURIComponent(album.slug);

      var cover = document.createElement('span');
      cover.className = 'album-cover';
      var coverId = album.cover || (album.items[0] && album.items[0].id);
      var img = document.createElement('img');
      img.alt = '';
      if (coverId) {
        img.src = thumb(coverId, 600);
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
      } else {
        img.src = 'assets/img/cats/cat-face.svg';
        img.className = 'no-cover';
      }
      cover.appendChild(img);
      a.appendChild(cover);

      var name = document.createElement('span');
      name.className = 'album-title';
      name.textContent = album.title;
      a.appendChild(name);

      var meta = document.createElement('span');
      meta.className = 'album-meta';
      meta.textContent = [album.date, countLabel(album.items)].filter(Boolean).join(' · ');
      a.appendChild(meta);

      grid.appendChild(a);
    });
  }

  // ----- One album -----
  function renderItems(type) {
    visible = type === 'all' ? items : items.filter(function (it) { return it.type === type; });
    if (!visible.length) {
      showState('Nothing here yet.');
      return;
    }
    grid.innerHTML = '';
    visible.forEach(function (item, i) {
      var btn = document.createElement('button');
      btn.className = 'grid-item';
      btn.type = 'button';
      btn.setAttribute('aria-label', (item.type === 'video' ? 'Play video: ' : 'Open photo: ') + (item.caption || 'untitled'));

      var img = document.createElement('img');
      img.src = thumb(item.id, 600);
      img.alt = item.caption || '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      btn.appendChild(img);

      if (item.type === 'video') {
        var play = document.createElement('span');
        play.className = 'play';
        play.textContent = '▶';
        btn.appendChild(play);
      }
      if (item.caption) {
        var cap = document.createElement('span');
        cap.className = 'caption';
        cap.textContent = item.caption;
        btn.appendChild(cap);
      }
      btn.addEventListener('click', function () { open(i); });
      grid.appendChild(btn);
    });
  }

  function showAlbum(album) {
    document.title = album.title + ' · Gallery · Dustin';
    title.textContent = album.title;
    lead.textContent = album.description || [album.date, countLabel(album.items)].filter(Boolean).join(' · ');
    back.hidden = false;
    items = album.items;
    if (items.some(function (it) { return it.type === 'video'; }) && items.some(function (it) { return it.type !== 'video'; })) {
      filterBar.hidden = false;
    }
    grid.className = 'grid';
    renderItems('all');
  }

  // ----- Lightbox -----
  function show(i) {
    current = (i + visible.length) % visible.length;
    var item = visible[current];
    stage.innerHTML = '';
    var media;
    if (item.type === 'video') {
      media = document.createElement('iframe');
      media.src = 'https://drive.google.com/file/d/' + encodeURIComponent(item.id) + '/preview';
      media.allow = 'autoplay; fullscreen';
      media.allowFullscreen = true;
      media.title = item.caption || 'Video';
    } else {
      media = document.createElement('img');
      media.src = thumb(item.id, 2000);
      media.alt = item.caption || '';
      media.referrerPolicy = 'no-referrer';
    }
    stage.appendChild(media);
    var caption = [item.caption, item.date].filter(Boolean).join(' · ');
    if (caption) {
      var p = document.createElement('p');
      p.className = 'lightbox-caption';
      p.textContent = caption;
      stage.appendChild(p);
    }
  }

  function open(i) {
    show(i);
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
    box.querySelector('.lb-close').focus();
  }

  function close() {
    box.classList.remove('open');
    stage.innerHTML = ''; // stops video playback
    document.body.style.overflow = '';
  }

  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', function () { show(current - 1); });
  box.querySelector('.lb-next').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });

  filters.forEach(function (chip) {
    chip.addEventListener('click', function () {
      filters.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      chip.setAttribute('aria-pressed', 'true');
      renderItems(chip.dataset.filter);
    });
  });

  // ----- Load -----
  fetch('data/gallery.json')
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var albums = (data.albums || []).map(function (album) {
        return {
          title: album.title || 'Untitled',
          slug: album.slug || slugify(album.title || 'untitled'),
          date: album.date || '',
          description: album.description || '',
          cover: album.cover || '',
          items: (album.items || []).filter(function (it) { return it.id; })
        };
      });

      var wanted = new URLSearchParams(location.search).get('album');
      if (!wanted) {
        renderAlbums(albums);
        return;
      }
      var album = albums.find(function (a) { return a.slug === wanted; });
      if (album) {
        showAlbum(album);
      } else {
        back.hidden = false;
        showState('This album wandered off.', { href: 'gallery.html', text: 'See all albums' });
      }
    })
    .catch(function () {
      showState('Oops, the gallery could not be loaded. The cat knocked it off the table.');
    });
})();
