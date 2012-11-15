var store, adapter, Post, Comment, originalAjax, requests;

Post = DS.Model.extend();
Comment = DS.Model.extend();

Post.reopen({
  title: DS.attr('string'),
  comments: DS.hasMany(Comment),
  commentsCount: DS.attr('number')
});
Post.toString = function() { return "Post"; };

Comment.reopen({
  body: DS.attr('string'),
  post: DS.belongsTo(Post)
});
Comment.toString = function() { return "Comment"; };

module("Sideloading", {
  setup: function() {
    var adapter;

    requests = [];

    originalAjax = Ember.$.ajax;
    Ember.$.ajax = function(options) {
      requests.push(options);
    };

    adapter = DS.RESTAdapter.extend();
    store = DS.Store.create({
      isDefaultStore: true,
      adapter: adapter
    });
  },

  teardown: function() {
    Ember.$.ajax = originalAjax;
    Ember.run(function() {
      store.destroy();
    });
  }
});

test("records can be sideloaded while still in flight, waiting on other associated records", function() {
  var post, comment, postRequest, commentRequest;

  post = store.createRecord(Post, { title: 'Welcome to My Blog' });
  comment = store.createRecord(Comment, { body: 'First!' });
  comment.set('post', post);

  store.commit();

  postRequest = requests[0];
  equal(post.get('commentsCount'), null, 'post comments count is not yet set');
  equal(postRequest.url, "/posts", "the post is created first");

  Ember.run(function() {
    var postJson = {
      post: { id: 1, title: 'Welcome to My Blog', comments_count: 0 }
    };
    postRequest.success(postJson);
  });
  equal(post.get('commentsCount'), 0, 'post comments count is set to 0');

  commentRequest = requests[1];
  equal(commentRequest.url, "/comments", "the comment is created second");

  Ember.run(function() {
    var commentJson = {
      comment: { id: 1, body: 'First!', post: 1 },
      posts: [
        { id: 1, title: 'Welcome to My Blog', comments_count: 1 }
      ]
    };
    commentRequest.success(commentJson);
  });
  equal(post.get('commentsCount'), 1, 'post comments count is updated to 1');
});
