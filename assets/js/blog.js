// Blog: lists posts/posts.json on blog.html, renders posts/<slug>.md on post.html.
(function () {
  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function stateHTML(message) {
    return '<div class="state"><img src="assets/img/cats/cat-sleeping.svg" alt=""><p>' + message + '</p></div>';
  }

  function loadIndex() {
    return fetch('posts/posts.json').then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  }

  // ----- blog.html -----
  var list = document.getElementById('post-list');
  if (list) {
    loadIndex()
      .then(function (posts) {
        if (!posts.length) {
          list.outerHTML = stateHTML('No posts yet. The cat is still thinking.');
          return;
        }
        posts.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        posts.forEach(function (post) {
          var li = el('li');
          var a = el('a', 'card');
          a.href = 'post.html?slug=' + encodeURIComponent(post.slug);
          a.appendChild(el('span', 'meta', formatDate(post.date)));
          a.appendChild(el('h2', null, post.title));
          if (post.summary) a.appendChild(el('p', null, post.summary));
          if (post.tags && post.tags.length) {
            var tags = el('div', 'tags');
            post.tags.forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
            a.appendChild(tags);
          }
          li.appendChild(a);
          list.appendChild(li);
        });
      })
      .catch(function () {
        list.outerHTML = stateHTML('Could not load posts right now.');
      });
  }

  // ----- post.html -----
  var article = document.getElementById('post');
  if (article) {
    var slug = new URLSearchParams(location.search).get('slug');
    var notFound = function () {
      document.title = 'Post not found · Dustin';
      article.querySelector('.post-body').innerHTML =
        stateHTML('This post wandered off. <a href="blog.html">See all posts</a>.');
    };

    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      notFound();
      return;
    }

    Promise.all([
      loadIndex().catch(function () { return []; }),
      fetch('posts/' + slug + '.md').then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
    ])
      .then(function (results) {
        var meta = results[0].find(function (p) { return p.slug === slug; }) || {};
        var md = results[1];
        var title = meta.title || slug;
        document.title = title + ' · Dustin';
        article.querySelector('h1').textContent = title;
        var metaLine = article.querySelector('.meta');
        metaLine.textContent = meta.date ? formatDate(meta.date) : '';
        if (meta.tags && meta.tags.length) {
          var tags = el('div', 'tags');
          meta.tags.forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
          metaLine.after(tags);
        }
        article.querySelector('.post-body').innerHTML = DOMPurify.sanitize(marked.parse(md));
      })
      .catch(notFound);
  }
})();
