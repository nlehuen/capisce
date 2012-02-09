// Yet another workers queue. It's a good exercice to write one
// for beginners in node.js, like me - Nico
function WorkingQueue(parallel) {
	var that = this;

	// Parallelization degree, if not mentioned use 64
	// Don't forget that we are in a SINGLE-threaded process
	// All we want it to somewhat limit the number of simultaneous
	// I/O requests
	parallel = parallel || 64;

	var queue = [];
	var workers = 0;
	var whenDoneCallbacks = [];

	// Main method : launches a job immediatly or queue it
	// if maximum number of workers has been reached
	this.perform = function(job) {
		if(workers < parallel) {
			workers++;
			process.nextTick(function() { job(over); });
		}
		else {
			queue.push(job);
		}
		return this;
	};

	// Register a callback that will be called when
	// all jobs have been done.
	// If a callback is registered after the jobs are over,
	// it is called immediatly
	this.whenDone = function(fun) {
		whenDoneCallbacks.push(fun);
		if(workers === 0) fun();
	}

	function allDone() {
		var i, l;
		for(i=0, l=whenDoneCallbacks.length; i < l; i++) {
			whenDoneCallbacks[i]();
		}
	}

	// This function is passed to each job, it must be called
	// when the job is done.
	function over() {
		var job = queue.shift();
		if(job) {
			process.nextTick(function() { job(over); });
		}
		else {
			workers--;

			if(workers === 0) {
				allDone();
			}
		}
	};

	this.then = function(job) {
		if(parallel>1) throw 'Cannot use then in a parallel section';
		this.perform(job);
		return this;
	};

	this.thenConcurrently = function(block, parallel2) {
		if(parallel>1) throw 'Cannot use thenConcurrently in a parallel section';
		this.perform(function(over) {
			var p = new WorkingQueue(parallel2);
			block(p, over);
		});
		return this;
	};
}

// Wraps a WorkingQueue to collect results from job
// Use whenDone(fun) to have fun(result) called at the end
// of all jobs. result is a list of [id, err, value], and you
// can choose to sort it to get the result in the order the job,
// were added.
function CollectingWorkingQueue(parallel) {
	var queue = new WorkingQueue(parallel);
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

function sequence() {
	return new WorkingQueue(1);
}

function parallel(parallel) {
	return new WorkingQueue(parallel);
}

exports.WorkingQueue = WorkingQueue
exports.CollectingWorkingQueue = CollectingWorkingQueue
exports.sequence = sequence
exports.parallel = parallel