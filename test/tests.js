"use strict";

// Make jshint happy
/*global describe:false, it:false */

var capisce = require('../lib/capisce.js');
var assert = require("assert");

var LAPSE = 50;

describe('WorkingQueue', function(){
    it('performs jobs passed without parameters', function(done){

        var queue = new capisce.WorkingQueue(1);
        var result = 0;

        queue.perform(function(over) {
            setTimeout(function() {
                result = 1;
                over();
            }, LAPSE);
        });

        queue.whenDone(function() {
            assert.equal(1, result);
            done();
        });
    });

    it('performs jobs passed with parameters', function(done){

        var queue = new capisce.WorkingQueue(1);
        var result = 0;

        queue.perform(function(a, b, over) {
            setTimeout(function() {
                result = a + b;
                over();
            }, LAPSE);
        }, 41, 1);

        queue.whenDone(function() {
            assert.equal(42, result);
            done();
        });
    });

  it('triggers whenDone when doneAddingJobs is called', function(done) {
        
        var queue = new capisce.WorkingQueue(1);
        var waited = 0;

        queue.whenDone(function() {
            assert.equal(1, waited);
            done();
        });

        setTimeout(function() {
            waited = 1;
            queue.doneAddingJobs();
        }, LAPSE);
  });

  it('does not trigger whenDone twice when doneAddingJobs is called after adding a job', function(done) {
        
        var queue = new capisce.WorkingQueue(1);
        var waited = 0;

        queue.perform(function(over) {
            waited = 1;
            over();
        });

        queue.whenDone(function() {
            assert.equal(1, waited);
            setTimeout(function() {
                done();
            }, 2*LAPSE);
        });

        setTimeout(function() {
            waited = 2;
            queue.doneAddingJobs();
        }, LAPSE);
  });

  it('holds when asked to', function(done) {

        var queue = new capisce.WorkingQueue(1);
        var result = 0;
        var isDone = 0;

        queue.hold();
        queue.perform(function(over) {
            result = 1;
            over();
        });

        setTimeout(function() {
            assert.equal(0, result);

            queue.go();

            setTimeout(function() {
                assert.equal(1, result);
                assert.equal(1, isDone);
                done();
            }, LAPSE);
        }, LAPSE);

        queue.whenDone(function() {
            assert.equal(1, result);
            assert.equal(0, isDone);
            isDone = 1;
        });
  });

  it('runs jobs in sequence when concurrency==1', function(done) {

        var result = [];
        var repeat = 8;
        var queue = new capisce.WorkingQueue(1);
        var workers = 0;

        function job(i, over) {
            workers++;
            assert.equal(1, workers, "more than one worker in a sequence");

            setTimeout(function() {
                assert.equal(1, workers, "more than one worker in a sequence");
                result.push(i);
                workers--;
                over();
            }, Math.random() * LAPSE);
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job, i);
        }

        queue.whenDone(function() {
            for(var i = 0; i<repeat; i++) {
                assert.equal(i, result[i], "sequence was not executed in order");
            }
            done();
        });

  });

  it('runs jobs in parallel when concurrency>1', function(done) {

        var result = 0;
        var repeat = 8;
        var concurrency = 4;
        var queue = new capisce.WorkingQueue(concurrency);
        var workers = 0;
        var concurrent = false;

        function job(over) {
            workers++;
            assert.ok(workers<=concurrency, "concurrency level is not respected");
            if(workers > 1) {
                concurrent = true;
            }

            setTimeout(function() {
                assert.ok(workers<=concurrency, "concurrency level is not respected");
                workers--;
                result++;
                over();
            }, Math.random() * LAPSE);
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job);
        }

        queue.whenDone(function() {
            assert.equal(repeat, result, "not all jobs have run");
            assert.ok(concurrent, "no concurrency was observed");
            done();
        });

  });

  it('can be built with sequence()', function(done) {
        var result = 0;

        capisce.sequence().perform(function(over) {
            result += 2;
            over();
            assert.equal(2, result);
        }).then(function(over) {
            result += 3;
            over();
            assert.equal(5, result);
        }).whenDone(function() {
            assert.equal(5, result);
            done();
        });
  });

  it('can be built with sequence(), using the shortcut notation', function(done) {
        var result = 0;

        capisce.sequence(function(over) {
            result += 2;
            over();
            assert.equal(2, result);
        }).then(function(over) {
            result += 3;
            over();
            assert.equal(5, result);
        }).whenDone(function() {
            assert.equal(5, result);
            done();
        });
  });

  it('can be built with sequence(), using the shortcut notation and job parameters', function(done) {
        var result = 0;

        capisce.sequence(function(i, over) {
            result += i;
            over();
            assert.equal(i, result);
        }, 5).then(function(over) {
            setTimeout(function() {
                result += 3;
                over();
                assert.equal(8, result);
            }, LAPSE);
        }).whenDone(function() {
            assert.equal(8, result);
            done();
        });
  });

  it('supports enqueuing jobs with other.then', function(done) {
        var result = 0;

        capisce.sequence().perform(function(over) {
            result += 2;
            over.then(function(over) {
                result += 3;
                over();
            });
            assert.equal(2, result);
        }).whenDone(function() {
            assert.equal(5, result);
            done();
        });
  });

});

describe('ConcurrentWorkingQueue', function(){
    
    it('collects results', function(done) {
        var queue = new capisce.CollectingWorkingQueue(2);
        var repeat = 10;

        function job(i) {
            return function(over) {
                setTimeout(function() {
                    over(null, i*7);
                }, Math.random() * 100);
            };
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job(i));
        }

        queue.whenDone(function(result) {
            assert.equal(repeat, result.length);
            result.sort();
            assert.equal(0, result[0][2]);
            assert.equal((repeat-1)*7, result[repeat-1][2]);
            done();
        });

    });

    it('collects results when passed parameters', function(done) {
        var queue = new capisce.CollectingWorkingQueue(2);
        var repeat = 10;

        function job(i, j, over) {
            setTimeout(function() {
                over(null, i*7+j);
            }, Math.random() * 100);
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job, i, 5);
        }

        queue.whenDone(function(result) {
            assert.equal(repeat, result.length);
            result.sort();
            assert.equal(5, result[0][2]);
            assert.equal((repeat-1)*7 + 5, result[repeat-1][2]);
            done();
        });

    });
});

