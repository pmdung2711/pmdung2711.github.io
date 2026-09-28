// Learning: renders courses from data/learning.json.
// learning.html             → course shelf
// learning.html?course=slug → one course's study materials
(function () {
  var list = document.getElementById('learning-list');
  var title = document.getElementById('learning-title');
  var lead = document.getElementById('learning-lead');
  var back = document.getElementById('course-back');

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function slugify(text) {
    return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function showState(message, link) {
    var div = el('div', 'state');
    div.innerHTML = '<img src="assets/img/cats/cat-sleeping.svg" alt="">';
    var p = el('p', null, message + ' ');
    if (link) {
      var a = el('a', null, link.text);
      a.href = link.href;
      p.appendChild(a);
    }
    div.appendChild(p);
    list.replaceWith(div);
  }

  function card(href, meta, heading, text, tags) {
    var li = el('li');
    var a = el('a', 'card');
    a.href = href;
    if (meta) a.appendChild(el('span', 'meta', meta));
    a.appendChild(el('h2', null, heading));
    if (text) a.appendChild(el('p', null, text));
    if (tags && tags.length) {
      var box = el('div', 'tags');
      tags.forEach(function (t) { box.appendChild(el('span', 'tag', t)); });
      a.appendChild(box);
    }
    li.appendChild(a);
    return li;
  }

  // ----- Course shelf -----
  function renderCourses(courses) {
    if (!courses.length) {
      showState('No courses yet. The cat is still picking one.');
      return;
    }
    courses.forEach(function (course) {
      list.appendChild(card(
        'learning.html?course=' + encodeURIComponent(course.slug),
        plural(course.materials.length, 'study desk'),
        course.title,
        course.description
      ));
    });
  }

  // ----- One course -----
  function renderCourse(course) {
    document.title = course.title + ' · Learning · Dustin';
    title.textContent = course.title;
    lead.textContent = course.description || '';
    back.hidden = false;
    if (!course.materials.length) {
      showState('Nothing here yet. Check back soon.');
      return;
    }
    course.materials.forEach(function (m) {
      list.appendChild(card(m.href, m.subtitle, m.title, m.description, m.tags));
    });
  }

  fetch('data/learning.json')
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var courses = (data.courses || []).map(function (c) {
        c.slug = c.slug || slugify(c.title);
        c.materials = c.materials || [];
        return c;
      });
      var slug = new URLSearchParams(location.search).get('course');
      if (!slug) {
        renderCourses(courses);
        return;
      }
      var course = courses.find(function (c) { return c.slug === slug; });
      if (course) {
        renderCourse(course);
      } else {
        back.hidden = false;
        showState('This course wandered off.', { href: 'learning.html', text: 'See all courses' });
      }
    })
    .catch(function () {
      showState('Could not load courses right now.');
    });
})();
