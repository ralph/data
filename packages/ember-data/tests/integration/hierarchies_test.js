var get = Ember.get, set = Ember.set;
/*global $*/

var adapter, store, serializer, ajaxResults, ajaxCalls, promises, idCounter;
var Adapter, Post, Comment, Tag, Vote, Group;

var TestAdapter = DS.RESTAdapter.extend({
  ajax: function(url, type, hash) {
    var success = hash.success, self = this;
    var deferred = $.Deferred();

    var json = ajaxResults[type + ":" + url]();
    ajaxCalls.push(type + ":" + url);
    setTimeout(function() {
      success.call(self, json);
      deferred.resolve();
    });

    var promise = deferred.promise();
    promises.push(promise);

    return promise;
  }
});

module("DS.RESTAdapter Hierarchies", {
  setup: function() {
    promises = [];
    ajaxResults = {};
    ajaxCalls = [];
    idCounter = 1;
    Adapter = TestAdapter.extend();

    Post = DS.Model.extend({});
    Post.toString = function() {
      return "App.Post";
    };

    Tag = DS.Model.extend({
      name: DS.attr('string'),
      post: DS.belongsTo(Post)
    });
    Tag.toString = function() {
      return "App.Tag";
    };

    Comment = DS.Model.extend();
    Comment.toString = function() {
      return "App.Comment";
    };

    Vote = DS.Model.extend({
      comment: DS.belongsTo(Comment)
    });
    Vote.toString = function() {
      return "App.Vote";
    };

    Comment.reopen({
      body: DS.attr('string'),
      post: DS.belongsTo(Post),
      comments: DS.hasMany(Comment),
      comment: DS.belongsTo(Comment),
      votes: DS.hasMany(Vote)
    });

    Post.reopen({
      title: DS.attr('string'),
      comments: DS.hasMany(Comment),
      tags: DS.hasMany(Tag)
    });

    Adapter.map(Post, {
      tags: { embedded: 'always' }
    });

    adapter = Adapter.create();

    serializer = get(adapter, 'serializer');

    store = DS.Store.create({
      adapter: adapter
    });
  },

  teardown: function() {
    adapter.destroy();
    store.destroy();
    ajaxResults = undefined;
    ajaxCalls = undefined;
    promises = undefined;
    idCounter = undefined;
  }
});

function waitForPromises(callback) {
  $.when.apply($, promises).then(function() {
    // promise inception!!
    if(promises.length > 0) {
      waitForPromises(callback);
    } else {
      start();
      if(callback) { callback.call(this); }
    }
  });
  promises = [];
}

function dataForRequest(record, props) {
  props = props || {};
  var root = adapter.rootForType(record.constructor);
  var data = adapter.serialize(record, { includeId: true });
  Ember.merge(data, props);
  var result = {};
  result[root] = data;
  return result;
}

function dataForCreate(record, props) {
  props = props || {};
  Ember.merge(props, {id: idCounter++});
  return dataForRequest(record, props);
}

function dataForBulkRequest(records) {
  var type = records[0].constructor;
  var root = adapter.rootForType(type);
  root = serializer.pluralize(root);
  var data = records.map(function(r) {
    return adapter.serialize(r, { includeId: true });
  });
  var result = {};
  result[root] = data;
  return result;
}

function dataForBulkCreate(records) {
  var type = records[0].constructor;
  var root = adapter.rootForType(type);
  root = serializer.pluralize(root);
  var data = records.map(function(r) {
    var hash = adapter.serialize(r, { includeId: true });
    hash.id = idCounter++;
    return hash;
  });
  var result = {};
  result[root] = data;
  return result;
}

asyncTest("creating parent->child hierarchy", function () {
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var comment = get(post, 'comments').createRecord({body: 'not me'});

  ajaxResults = {
    'POST:/comments': function() { return dataForCreate(comment); },
    'POST:/posts': function() { return dataForCreate(post); }
  };

  store.commit();
  equal(get(post, 'comments.firstObject'), comment, "post's comments should include comment");

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['POST:/posts', 'POST:/comments'], 'parent should be created first');
    equal(get(comment, 'post'), post, "post should be set");
    equal(get(post, 'comments.firstObject'), comment, "post's comments should include comment");
  });
});

asyncTest("creating parent->child->child hierarchy", function () {
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var comment = get(post, 'comments').createRecord({body: 'not me'});
  var vote = get(comment, 'votes').createRecord({});

  ajaxResults = {
    'POST:/comments': function() { return dataForCreate(comment); },
    'POST:/votes': function() { return dataForCreate(vote); },
    'POST:/posts': function() { return dataForCreate(post); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['POST:/posts', 'POST:/comments', 'POST:/votes'], 'parents should be created first');
    equal(get(comment, 'post'), post, "post should be set");
    equal(get(vote, 'comment'), comment, "comment should be set");
  });
});

// asyncTest("creating recursive parent->child->child hierarchy", function () {
//   var post = store.createRecord(Post, {title: 'Who needs ACID??'});
//   var comment = get(post, 'comments').createRecord({body: 'not me'});
//   var subComment = get(comment, 'comments').createRecord({body: 'why not?'});
//   debugger

//   ajaxResults = {
//     'POST:/comments': function() {
//       ajaxResults['POST:/comments'] = function() { return dataForCreate(subComment); };
//       return dataForCreate(comment);
//     },
//     'POST:/posts': function() { return dataForCreate(post); }
//   };

//   store.commit();

//   waitForPromises(function() {
//     deepEqual(ajaxCalls, ['POST:/posts', 'POST:/comments', 'POST:/comments'], 'parents should be created first');
//     equal(get(comment, 'post'), post, "post should be set");
//     equal(get(subComment, 'comment'), comment, "comment should be set");
//   });
// });

asyncTest("deleting child", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [2]});
  adapter.load(store, Comment, {id: 2, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 2);

  comment.deleteRecord();

  var deleteHit = false;
  ajaxResults = {
    'DELETE:/comments/2': function() { deleteHit = true; return {}; }
  };

  store.commit();

  waitForPromises(function() {
    ok(deleteHit, "comment should have received a DELETE request");
    equal(get(post, 'comments.length'), 0, 'post should not have any comments');
  });
});

asyncTest("deleting child and updating parent", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [2]});
  adapter.load(store, Comment, {id: 2, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 2);

  set(post, 'title', 'Who ALWAYS needs ACID?');
  comment.deleteRecord();

  ajaxResults = {
    'DELETE:/comments/2': function() {},
    'PUT:/posts/1': function() { return {post: {id: 1, title: 'Who ALWAYS needs ACID?'}}; }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['DELETE:/comments/2', 'PUT:/posts/1'], 'comment should be deleted first');
    equal(get(post, 'comments.length'), 0, 'post should not have any comments');
  });
});

asyncTest("deleting child and parent", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [2]});
  adapter.load(store, Comment, {id: 2, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 2);

  post.deleteRecord();
  comment.deleteRecord();

  var commentDelete = false;
  var postDelete = false;
  ajaxResults = {
    'DELETE:/comments/2': function() { commentDelete = true; },
    'DELETE:/posts/1': function() { postDelete = true; }
  };

  store.commit();

  waitForPromises(function() {
    ok(commentDelete, "comment should have received a DELETE request");
    ok(postDelete, "post should have received a DELETE request");
  });
});

asyncTest("creating embedded parent->child hierarchy", function() {
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var tag = get(post, 'tags').createRecord({name: 'current'});

  ajaxResults = {
    'POST:/posts': function() { return dataForCreate(post); }
  };

  store.commit();

  waitForPromises(function() {
    equal(get(tag, 'post'), post, "post should be set");
  });
});

asyncTest("deleting embedded child", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', tags: [{id: 2, name: 'current', post_id: 1}]});

  var post = store.find(Post, 1);
  var tag = store.find(Tag, 2);

  tag.deleteRecord();

  var deleteHit = false;
  ajaxResults = {
    'PUT:/posts/1': function() { return dataForRequest(post, {tags: []}); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['PUT:/posts/1'], 'only the parent should be updated');
    equal(get(post, 'tags.length'), 0, 'post should not have any tags');
  });
});

asyncTest("deleting embedded child and updating parent", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', tags: [{id: 2, name: 'current', post_id: 1}]});

  var post = store.find(Post, 1);
  var tag = store.find(Tag, 2);

  set(post, 'title', 'Who ALWAYS needs ACID?');
  tag.deleteRecord();

  ajaxResults = {
    'PUT:/posts/1': function() { return dataForRequest(post, {tags: []}); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['PUT:/posts/1'], 'only the parent should be updated');
    equal(get(post, 'tags.length'), 0, 'post should not have any tags');
  });
});

asyncTest("deleting embedded child and parent", function () {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', tags: [{id: 2, name: 'current', post_id: 1}]});

  var post = store.find(Post, 1);
  var tag = store.find(Tag, 2);

  post.deleteRecord();
  tag.deleteRecord();

  ajaxResults = {
    'DELETE:/posts/1': function() {}
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['DELETE:/posts/1'], 'only the parent should be deleted');
  });
});

asyncTest("deleting embedded child and non-embedded child and starting a new transaction", function() {
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', tags: [{id: 2, name: 'current', post_id: 1}], comments: [3]});
  adapter.load(store, Comment, {id: 3, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var tag = store.find(Tag, 2);
  var comment = store.find(Comment, 3);

  tag.deleteRecord();
  comment.deleteRecord();

  ajaxResults = {
    'PUT:/posts/1': function() { return dataForRequest(post, {tags: []}, {comments: []}); },
    'DELETE:/comments/3': function() {}
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['DELETE:/comments/3', 'PUT:/posts/1'], 'ajax calls should be in the correct order');
    equal(get(post, 'tags.length'), 0, 'post should not have any tags');
    equal(get(post, 'comments.length'), 0, 'post should not have any comments');

    var transaction = store.transaction();

    transaction.add(post);
    transaction.rollback();
  });

});

asyncTest("creating parent->children hierarchy with bulkCommit=true", function () {
  set(adapter, 'bulkCommit', true);
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var comments = [get(post, 'comments').createRecord({body: 'not me'}),
                  get(post, 'comments').createRecord({body: 'me either'})];

  ajaxResults = {
    'POST:/comments': function() { return dataForBulkCreate(comments); },
    'POST:/posts': function() { return dataForBulkCreate([post]); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['POST:/posts', 'POST:/comments'], 'parent should be created first');
    comments.forEach(function(comment) {
      equal(get(comment, 'post'), post, "post should be set");
    });
  });
});

asyncTest("deleting child and updating parent with bulkCommit=true", function () {
  set(adapter, 'bulkCommit', true);
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [2]});
  adapter.load(store, Comment, {id: 2, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 2);

  set(post, 'title', 'Who ALWAYS needs ACID?');
  comment.deleteRecord();

  ajaxResults = {
    'DELETE:/comments/bulk': function() {},
    'PUT:/posts/bulk': function() { return {posts: [{id: 1, title: 'Who ALWAYS needs ACID?'}]}; }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['DELETE:/comments/bulk', 'PUT:/posts/bulk'], 'comment should be deleted first');
    equal(get(post, 'comments.length'), 0, 'post should not have any comments');
  });
});

asyncTest("creating parent->child->child hierarchy with bulkCommit=true", function () {
  set(adapter, 'bulkCommit', true);
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var comment = get(post, 'comments').createRecord({body: 'not me'});
  var vote = get(comment, 'votes').createRecord({});

  ajaxResults = {
    'POST:/comments': function() { return dataForBulkCreate([comment]); },
    'POST:/votes': function() { return dataForBulkCreate([vote]); },
    'POST:/posts': function() { return dataForBulkCreate([post]); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['POST:/posts', 'POST:/comments', 'POST:/votes'], 'parents should be created first');
    equal(get(comment, 'post'), post, "post should be set");
    equal(get(vote, 'comment'), comment, "comment should be set");
  });
});

asyncTest("deleting child and parent with bulkCommit=true", function () {
  set(adapter, 'bulkCommit', true);
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [2]});
  adapter.load(store, Comment, {id: 2, title: 'not me', post_id: 1});

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 2);

  post.deleteRecord();
  comment.deleteRecord();

  var commentDelete = false;
  var postDelete = false;
  ajaxResults = {
    'DELETE:/comments/bulk': function() { commentDelete = true; },
    'DELETE:/posts/bulk': function() { postDelete = true; }
  };

  store.commit();

  waitForPromises(function() {
    ok(commentDelete, "comment should have received a DELETE request");
    ok(postDelete, "post should have received a DELETE request");
  });
});

module("DS.RESTAdapter Hierarchies - Complex Embedded", {
  setup: function() {
    promises = [];
    ajaxResults = {};
    ajaxCalls = [];
    idCounter = 1;
    Adapter = TestAdapter.extend();

    Group = DS.Model.extend();
    Group.toString = function() {
      return "App.Group";
    };

    Post = DS.Model.extend({
      group: DS.belongsTo(Group)
    });
    Post.toString = function() {
      return "App.Post";
    };

    Group.reopen({
      title: DS.attr('string'),
      posts: DS.hasMany(Post)
    });

    Comment = DS.Model.extend();
    Comment.toString = function() {
      return "App.Comment";
    };

    Vote = DS.Model.extend({
      comment: DS.belongsTo(Comment)
    });
    Vote.toString = function() {
      return "App.Vote";
    };

    Comment.reopen({
      body: DS.attr('string'),
      post: DS.belongsTo(Post),
      comments: DS.hasMany(Comment),
      comment: DS.belongsTo(Comment),
      votes: DS.hasMany(Vote),
      group: DS.belongsTo(Group)
    });

    Group.reopen({
      comments: DS.hasMany(Comment)
    });

    Post.reopen({
      title: DS.attr('string'),
      comments: DS.hasMany(Comment)
    });

    Adapter.map(Post, {
      comments: { embedded: 'always' }
    });

    Adapter.map(Comment, {
      votes: { embedded: 'always' }
    });

    adapter = Adapter.create();

    serializer = get(adapter, 'serializer');

    store = DS.Store.create({
      adapter: adapter
    });
  },

  teardown: function() {
    adapter.destroy();
    store.destroy();
    ajaxResults = undefined;
    ajaxCalls = undefined;
    promises = undefined;
    idCounter = undefined;
  }
});

asyncTest("creating grand-parent->embedded parent->embedded child hierarchy", function () {
  var post = store.createRecord(Post, {title: 'Who needs ACID??'});
  var comment = get(post, 'comments').createRecord({body: 'not me'});
  var vote = get(comment, 'votes').createRecord({});

  ajaxResults = {
    'POST:/posts': function() { return dataForCreate(post); }
  };

  store.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['POST:/posts'], 'only the parent should be receive an ajax request');
    equal(get(comment, 'post'), post, "post should be set");
    equal(get(vote, 'comment'), comment, "comment should be set");
  });
});

asyncTest("x -> {y -> embedded(z), z} :: delete z", function() {
  adapter.load(store, Group, {id: 1, post_ids: [1], comment_ids: [1]});
  adapter.load(store, Post, {id: 1, title: 'Who needs ACID??', comments: [{id: 1, title: 'not me', post_id: 1, group_id: 1}]});

  var group = store.find(Group, 1);
  var post = store.find(Post, 1);
  var comment = store.find(Comment, 1);

  var transaction = store.transaction();
  transaction.add(post);
  transaction.add(comment);

  ajaxResults = {
    'PUT:/posts/1': function() { return dataForRequest(post, {comments: []}); }
  };

  comment.deleteRecord();
  group.get('posts').removeObject(post);

  transaction.commit();

  waitForPromises(function() {
    deepEqual(ajaxCalls, ['PUT:/posts/1'], 'only the parent should be receive an ajax request');
    deepEqual(post.get('comments').toArray(), []);
    deepEqual(group.get('posts').toArray(), []);
  });
});
