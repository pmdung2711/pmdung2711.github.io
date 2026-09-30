// Games: renders the arcade shelf from data/games.json.
(function () {
  var list = document.getElementById('games-list');

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function showState(message) {
    var div = el('div', 'state');
    div.innerHTML = '<img src="assets/img/cats/cat-sleeping.svg" alt="">';
    div.appendChild(el('p', null, message));
    list.replaceWith(div);
  }

  function card(game) {
    var li = el('li');
    var a = el('a', 'card');
    a.href = game.href;
    if (game.subtitle) a.appendChild(el('span', 'meta', game.subtitle));
    a.appendChild(el('h2', null, game.title));
    if (game.description) a.appendChild(el('p', null, game.description));
    if (game.tags && game.tags.length) {
      var box = el('div', 'tags');
      game.tags.forEach(function (t) { box.appendChild(el('span', 'tag', t)); });
      a.appendChild(box);
    }
    li.appendChild(a);
    return li;
  }

  fetch('data/games.json')
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var games = data.games || [];
      if (!games.length) {
        showState('No games yet. The cat is still play-testing.');
        return;
      }
      games.forEach(function (game) { list.appendChild(card(game)); });
    })
    .catch(function () {
      showState('Could not load games right now.');
    });
})();
