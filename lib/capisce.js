// Yet another workers queue. It's a good exercice to write one
// for beginners in node.js, like me - Nico
function WorkingQueue(concurrency) {
    var that = this;

    // Parallelization degree, if not mentioned use 64
    // Don't forget that we are in a SINGLE-threaded process
    // All we want it to somewhat limit the number of simultaneous
    // I/O requests
    concurrency = concurrency || 64;

    var queue = [];
    var workers = 0;
    var whenDoneCallbacks = [];
    var held = false;

    // Main method : launches a job immediatly or queue it
    // if maximum number of workers has been reached
    this.perform = function(job) {
        queue.push(job);
        if(!held) go();
        return this;
    };

    // Register a callback that will be called when
    // all jobs have been done.
    // If a callback is registered after the jobs are over,
    // it is called immediatly
    this.whenDone = function(fun) {
        whenDoneCallbacks.push(fun);
    };

    // Holds the WorkingQueue. No job will be executed until
    // the go() method is called
    this.hold = function() {
        held = true;
    };

    // Launches the scheduled jobs
    this.go = function() {
        if(held) {
            held = false;
            go();
        }
    };
    
    // This method is used for a little DSL that can build sequence of
    // jobs, as well as concurrent sections within those sequences.
    this.then = function(block, concurrency2) {
        if(concurrency>1) throw 'Cannot use then in a concurrent section';

        if(block.length === 1) {
            if(arguments.length !== 1) throw 'Cannot specifiy a concurrency level for sequences';
            this.perform(block);
        } else if(block.length === 2) {
            this.perform(function(over) {
                var concurrently = new WorkingQueue(concurrency2);
                block(concurrently, function() {
                    concurrently.whenDone(over);
                });
            });
        } else {
            throw 'then accepts building function with one (sequence) or two (concurrent) arguments';
        }

        return this;
    };

    // This method waits the given timeout then executes the facultative
    // job.
    // This can be used in two ways :
    // sequence().wait(5000).then(function(over) {...})
    // OR
    // sequence().wait(5000,function(over) {...})s
    this.wait = function(timeout, job) {
        this.perform(function(over) {
           setTimeout(function() {
                if(job) {
                    job(over);
                }
                else {
                    over();
                }
           }, timeout);
        });
        return this;
    }
    
    // This function launches a new worker, if possible
    function go() {
        if(workers < concurrency) {
            var job = queue.shift();
            if(job) {
                workers++;
                process.nextTick(function() { job(over); });
            }
        }
    }

    // This function is passed to each job, it must be called
    // when the job is done.
    function over() {
        workers--;

        if(!held) go();

        if(queue.length === 0 && workers === 0) {
            var i, l;
            for(i=0, l=whenDoneCallbacks.length; i < l; i++) {
                whenDoneCallbacks[i]();
            }
        }
    }
}

// Wraps a WorkingQueue to collect results from job
// Use whenDone(fun) to have fun(result) called at the end
// of all jobs. result is a list of [id, err, value], and you
// can choose to sort it to get the result in the order the job,
// were added.
function CollectingWorkingQueue(concurrency) {
    var queue = new WorkingQueue(concurrency);
    var result = [];
    var idGen = 0;

    this.whenDone = function(fun) {
        queue.whenDone(function() {
            fun(result);    
        });
    }

    this.perform = function(job) {
        var id = idGen++;
        queue.perform(function(over) {
            job(function(err, res) {
                result.push([id, err, res]);
                over();
            });
        });
        return this;
    };
}

function sequence(fun) {
    var queue = new WorkingQueue(1);
    if(fun) queue.perform(fun);
    return queue;
}

function concurrently(concurrency) {
    return new WorkingQueue(concurrency);
}

exports.WorkingQueue = WorkingQueue
exports.CollectingWorkingQueue = CollectingWorkingQueue
exports.sequence = sequence
exports.concurrently = concurrently