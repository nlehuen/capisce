"use strict";

var util = require('util');

// Yet another workers queue. It's a good exercice to write one
// for beginners in node.js, like me - Nico
function WorkingQueue(concurrency) {
    // Parallelization degree, if not mentioned use 64
    // Don't forget that we are in a SINGLE-threaded process
    // All we want it to somewhat limit the number of simultaneous
    // I/O requests
    concurrency = concurrency || 64;


    // The queue contains tuples :
    // [job, arg1, arg2, arg3...]
    var queue = [];
    var workers = 0;
    var onceDoneCallbacks = [];
    var held = false;
    var added = false;

    // This function launches a new worker, if possible
    // It returns true if a new worker was launched, false otherwise.
    function _go() {
        if(workers < concurrency) {
            var job = queue.shift();
            if(job) {
                var worker = job.shift();
                job.push(over);
                workers++;
                process.nextTick(function nextTickWorker() {
                    worker.apply(null, job);
                });
                return true;
            }
        }
        return false;
    }

    // This function is passed to each job, it must be called
    // when the job is done.
    function over() {
        workers--;

        if(!held) { _go(); }

        checkDone();
    }

    function checkDone() {
        if(queue.length === 0 && workers === 0) {
            var i, l, callbacks;

            // Reset callbacks & statuts
            callbacks = onceDoneCallbacks;
            onceDoneCallbacks = [];
            added = false;

            for(i=0, l=callbacks.length; i < l; i++) {
                callbacks[i]();
            }
        }
    }

    // Enqueue a new job and ends the current one
    over.then = function overThen(/*...*/) {
        // Since it is only possible to get the over function
        // while running a job, no need to call this.perform
        queue.push(Array.prototype.slice.call(arguments, 0));
        added = true;
        return over();
    };

    // Main method : launches a job immediatly or queue it
    // if maximum number of workers has been reached
    this.perform = function perform(/*...*/) {
        queue.push(Array.prototype.slice.call(arguments, 0));
        added = true;
        if(!held) { _go(); }
        return this;
    };

    // Register a callback that will be called when
    // all jobs have been done.
    // If a callback is registered after the jobs are over,
    // it is called immediatly
    this.onceDone = function onceDone(fun) {
        onceDoneCallbacks.push(fun);
        if(added) { checkDone(); }
    };

    this.whenDone = util.deprecate(this.onceDone, "capisce.WorkingQueue.whenDone is deprecated, use onceDone instead.");

    this.doneAddingJobs = function doneAddingJobs() {
        if(!added) { checkDone(); }
    };

    // Holds the WorkingQueue. No job will be executed until
    // the go() method is called
    this.hold = function hold() {
        held = true;
    };

    // Launches the scheduled jobs
    this.go = function go() {
        if(held) {
            held = false;

            // Loop to launch as many workers as possible
            while(_go()) {}
        }
    };

    // This method is used for a little DSL that can build sequence of
    // jobs, as well as concurrent sections within those sequences.
    this.then = function then(block, concurrency2) {
        if(concurrency>1) { throw 'Cannot use then in a concurrent section'; }

        if(block.length === 1) {
            if(arguments.length !== 1) {
                throw 'Cannot specifiy a concurrency level for sequences';
            }
            this.perform(block);
        } else if(block.length === 2) {
            this.perform(function worker(over) {
                var concurrently = new WorkingQueue(concurrency2);
                block(concurrently, function over2() {
                    concurrently.onceDone(over);
                });
            });
        } else {
            throw 'then accepts building function with one (sequence) or two (concurrent) arguments';
        }

        return this;
    };

    function waiter(timeout, job, over) {
       setTimeout(function waiter() {
            if(job.length>0) {
                var func = job.shift();
                job.push(over);
                return func.apply(null, job);
            }
            else {
                return over();
            }
       }, timeout);
    }

    // This method waits the given timeout then executes the facultative
    // job.
    // This can be used in two ways :
    // sequence().wait(5000).then(function(over) {...})
    // OR
    // sequence().wait(5000,function(over) {...})s
    this.wait = function wait(timeout /*...*/) {
        var job = Array.prototype.slice.call(arguments, 1);
        this.perform(waiter, timeout, job);
        return this;
    };
}

// Wraps a WorkingQueue to collect results from job
// Use onceDone(fun) to have fun(result) called at the end
// of all jobs. result is a list of [id, err, value], and you
// can choose to sort it to get the result in the order the job,
// were added.
function CollectingWorkingQueue(concurrency) {
    var queue = new WorkingQueue(concurrency);
    var result = [];
    var idGen = 0;

    function worker(id, job, over) {
        var fun = job.shift();
        job.push(function overWithResult(err, res) {
            result.push([id, err, res]);
            over();
        });
        fun.apply(null, job);
    }

    this.onceDone = function onceDone(fun) {
        queue.onceDone(function onceDoneWorker() {
            fun(result);
        });
    };

    this.whenDone = util.deprecate(this.onceDone, "capisce.CollectingWorkingQueue.whenDone is deprecated, use onceDone instead.");

    this.perform = function perform(/*...*/) {
        var job = Array.prototype.slice.call(arguments, 0);
        var id = idGen++;
        queue.perform(worker, id, job);
        return this;
    };

    this.hold = function hold() {
        queue.hold();
    };

    this.go = function go() {
        queue.go();
    };

    this.doneAddingJobs = function doneAddingJobs() {
        queue.doneAddingJobs();
    };
}

function sequence(/*...*/) {
    var queue = new WorkingQueue(1);
    var job = Array.prototype.slice.call(arguments, 0);
    if(job.length>0) { queue.perform.apply(queue, job); }
    return queue;
}

function concurrently(concurrency) {
    return new WorkingQueue(concurrency);
}

exports.WorkingQueue = WorkingQueue;
exports.CollectingWorkingQueue = CollectingWorkingQueue;
exports.sequence = sequence;
exports.concurrently = concurrently;