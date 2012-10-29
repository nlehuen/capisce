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

        queue.onceDone(function() {
            assert.equal(1, result);
            done();
        });
    });

    it('supports whenDone even though it is deprecated', function(done){

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

        queue.onceDone(function() {
            assert.equal(42, result);
            done();
        });
    });

    it('processes lists', function(done){
        var queue = new capisce.WorkingQueue(16);
        var result = 0;
        var list = [1, 1, 2, 3, 5, 8, 13];

        function adder(index, element, over) {
            if(index % 2 == 0) {
                result += element;
            }
            over();
        }

        queue.processList(adder, list);

        queue.onceDone(function() {
            assert.equal(21, result);
            done();
        });
    });

    it('processes objects', function(done){
        var queue = new capisce.WorkingQueue(16);
        var list = {'Nicolas':30, 'Loïc':3, 'Lachlan':0.75};

        function Mean() {
            var total = 0.0;
            var count = 0;

            this.process = function(key, value, over) {
                total += value;
                count += 1;
                over();
            }

            this.result = function() {
                return total / count;
            }
        }

        var mean = new Mean();
        queue.processObject(mean.process, list);

        queue.onceDone(function() {
            assert.equal(11.25, mean.result());
            done();
        });
    });

    it('triggers onceDone when doneAddingJobs is called', function(done) {

        var queue = new capisce.WorkingQueue(1);
        var waited = 0;

        queue.onceDone(function() {
            assert.equal(1, waited);
            done();
        });

        setTimeout(function() {
            waited = 1;
            queue.doneAddingJobs();
        }, LAPSE);
    });

  it('does not trigger onceDone twice when doneAddingJobs is called after adding a job', function(done) {

        var queue = new capisce.WorkingQueue(1);
        var waited = 0;

        queue.perform(function(over) {
            waited = 1;
            over();
        });

        queue.onceDone(function() {
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

  it('calls onceDone callbacks only once', function(done) {
        var result = 0;
        var queue = new capisce.WorkingQueue(1);

        queue.onceDone(function() {
            assert.equal(0, result);
            result += 1;
        });

        queue.perform(function(over) {
            assert.equal(0, result);
            over();
        });

        queue.onceDone(function() {
            queue.perform(function(over) {
                assert.equal(1, result);
                over();
            });

            queue.onceDone(function() {
                assert.equal(1, result);
                done();
            });
        });
  });

  it('supports re-registering onceDone callbacks', function(done) {
        var result = 0;
        var queue = new capisce.WorkingQueue(1);

        queue.onceDone(function incr() {
            result += 1;
            queue.onceDone(incr);
        });

        queue.perform(function(over) {
            assert.equal(0, result);
            over();
        });

        queue.onceDone(function() {
            queue.perform(function(over) {
                assert.equal(1, result);
                over();
            });

            queue.onceDone(function() {
                assert.equal(2, result);
                done();
            });
        });
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

        queue.onceDone(function() {
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

        queue.onceDone(function() {
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

        queue.onceDone(function() {
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
        }).onceDone(function() {
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
        }).onceDone(function() {
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
        }).onceDone(function() {
            assert.equal(8, result);
            done();
        });
  });

  it('supports enqueuing jobs with over.then', function(done) {
        var result = 0;

        capisce.sequence().perform(function(over) {
            result += 2;
            over.then(function(over) {
                result += 3;
                over();
            });
            assert.equal(2, result);
        }).onceDone(function() {
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

        queue.onceDone(function(result) {
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

        queue.onceDone(function(result) {
            assert.equal(repeat, result.length);
            result.sort();
            assert.equal(5, result[0][2]);
            assert.equal((repeat-1)*7 + 5, result[repeat-1][2]);
            done();
        });

    });
});

