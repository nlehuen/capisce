"use strict";

var capisce = require('../lib/capisce.js');
var assert = require("assert");

var LAPSE = 50;

describe('WorkingQueue', function(){
    it('should perform jobs passed without parameters', function(done){

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

    it('should perform jobs passed with parameters', function(done){

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

  it('should trigger whenDone when doneSendingJobs is called', function(done) {
        
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

  it('should not trigger whenDone twice when doneSendingJobs is called after adding a job', function(done) {
        
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

  it('should hold processing when asked to', function(done) {

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

  it('should process jobs in sequence when concurrency==1', function(done) {

        var start = new Date().getTime();
        var result = 0;
        var repeat = 8;
        var queue = new capisce.WorkingQueue(1);

        function job(over) {
            setTimeout(function() {
                result++;
                over();
            }, LAPSE);
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job);
        }

        queue.whenDone(function() {
            var end = new Date().getTime();
            assert.equal(repeat, result);
            assert.ok(end - start >= repeat * LAPSE, "jobs are not serialized");
            done();
        });

  });

  it('should process jobs in parallel when concurrency>1', function(done) {

        var start = new Date().getTime();
        var result = 0;
        var repeat = 8;
        var queue = new capisce.WorkingQueue(2);

        function job(over) {
            setTimeout(function() {
                result++;
                over();
            }, LAPSE);
        }

        for(var i=0; i<repeat; i++) {
            queue.perform(job);
        }

        queue.whenDone(function() {
            var end = new Date().getTime();
            assert.equal(repeat, result);
            assert.ok(end - start > repeat * LAPSE / 2, "concurrency level is not respected");
            assert.ok(end - start < repeat * LAPSE, "jobs should not be serialized");
            done();
        });

  });
});


describe('ConcurrentWorkingQueue', function(){
    
    it('should collect results', function(done) {
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

    it('should collect results when passed parameters', function(done) {
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

