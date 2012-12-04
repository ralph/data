var get = Ember.get, set = Ember.set;

var Person, Comment, store, requests;

Person = DS.Model.extend();
Comment = DS.Model.extend();

Person.reopen({
  name: DS.attr('string'),
  comments: DS.hasMany(Comment)
});
Person.toString = function() { return "Person"; };

Comment.reopen({
  body: DS.attr('string'),
  person: DS.belongsTo(Person)
});
Comment.toString = function() { return "Comment"; };


var originalAjax;

module('Associations with the REST adapter', {
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

function expectState(record, state, value) {
  if (value === undefined) { value = true; }

  var flag = "is" + state.charAt(0).toUpperCase() + state.substr(1);
  equal(get(record, flag), value, "the " + record.constructor + " is " + (value === false ? "not " : "") + state);
}

function expectStates(records, state, value) {
  records.forEach(function(record) {
    expectState(record, state, value);
  });
}

test("creating a parent and child in the same commit", function() {
  var person, comment;

  comment = store.createRecord(Comment);
  person = store.createRecord(Person, { name: "John Doe" });
  person.get('comments').pushObject(comment);

  store.commit();

  expectStates([person, comment], 'saving', true);

  var personRequest = requests[0];
  equal(requests.length, 1, "Only one request is attempted");
  equal(personRequest.url, "/persons", "The person is created first");

  Ember.run(function() {
    personRequest.success({
      person: { id: 1, name: "John Doe", comments: [] },
      comments: []
    });
  });

  expectState(person, 'saving', false);
  expectState(comment, 'saving', true);
  expectStates([person, comment], 'error', false);

  var commentsRequest = requests[1];
  var requestData = JSON.parse(commentsRequest.data);
  equal(requests.length, 2, "A second request is attempted");
  equal(commentsRequest.url, "/comments", "The comment is created second");
  equal(requestData.comment.person_id, 1, "The submitted comment attributes include the person_id");

  deepEqual(person.get('comments').toArray(), [ comment ], "The person has the comment");
  equal(comment.get('person'), person, "The comment belongs to the person");

  Ember.run(function() {
    commentsRequest.success({
      comments: [{ id: 2, person_id: 1 }]
    });
  });

  stop();
  setTimeout(function() {
    start();

    expectStates([person, comment], 'saving', false);
    expectStates([person, comment], 'error', false);

    deepEqual(person.get('comments').toArray(), [ comment ], "The person has the comment");
    equal(comment.get('person'), person, "The comment belongs to the person");
  });
});

test("creating a parent and updating a child in the same commit", function() {
  var person, comment;

  store.load(Comment, { id: 2 });
  comment = store.find(Comment, 2);
  comment.set('body', 'Lorem ipsum dolor sit amet.');

  person = store.createRecord(Person, { name: "John Doe" });
  person.get('comments').pushObject(comment);

  store.commit();

  expectStates([person, comment], 'saving', true);

  var personRequest = requests[0];
  equal(requests.length, 1, "Only one request is attempted");
  equal(personRequest.url, "/persons", "The person is created first");

  Ember.run(function() {
    var personJson = {
      person: { id: 1, name: "John Doe", comments: [] },
      comments: []
    };
    personRequest.success(personJson);
  });
  expectState(person, 'saving', false);
  expectState(comment, 'saving', true);
  expectStates([person, comment], 'error', false);

  var commentsRequest = requests[1];
  var commentData = JSON.parse(commentsRequest.data);
  equal(requests.length, 2, "A second request is attempted");
  equal(commentsRequest.url, "/comments/2", "The comment is updated second");
  equal(commentData.comment.person_id, 1, "The submitted comment attributes include the person_id");

  deepEqual(person.get('comments').toArray(), [ comment ], "The person has the comment");
  equal(comment.get('person'), person, "The comment belongs to the person");

  Ember.run(function() {
    commentsRequest.success({});
  });

  stop();
  setTimeout(function() {
    start();

    expectStates([person, comment], 'saving', false);
    expectStates([person, comment], 'error', false);

    deepEqual(person.get('comments').toArray(), [ comment ], "The person has the comment");
    equal(comment.get('person'), person, "The comment belongs to the person");
  });
});
