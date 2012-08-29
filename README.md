[![build status](https://secure.travis-ci.org/nlehuen/capisce.png)](http://travis-ci.org/nlehuen/capisce)
capisce
=======

This module implements an asynchronous job queueing system with the `WorkingQueue` class. Jobs are processed concurrently up to a given degree of "concurrency" ; of course, if this degree is 1, then jobs are processed sequentially.

The basic use case of this module is when you want to perform a bunch (hundreds or thousands) of I/O related tasks, for instance HTTP requests. In order to play nice with others and make sure the I/O stack (file descriptors, TCP/IP stack etc.) won't be submerged by thousands of concurrent requests, you have to put an artificial limit on the requests that are launched concurrently. When this limit is reached, jobs have to be queued until some other job is finished. And that's exactly what `WorkingQueue` is for !

The WorkingQueue class
----------------------

### Creating a queue

This class is instanciated with a single parameter : the `concurrency` level of the queue. Again, if the concurrency level is 1, then it means that all jobs will be processed sequentially.

```javascript
var WorkingQueue = require('capisce').WorkingQueue;
var queue = new WorkingQueue(16);
```

### Launching jobs

You can then launch jobs using the `perform()` method. If the current concurrency limit has not been reached, then the job will be scheduled immediatly. Otherwise, it is queued for later execution.

Jobs are simple functions that are passed a very important parameter : the `over()` function. The job MUST call the over function at the end of its process to signal the `WorkingQueue` that it is, well, over.

```javascript
queue.perform(function(over) {
    console.log("Hello, world !");
    over();
});
```

The `over()` function can be passed around inside your job. In fact it's the only way to perform interesting things : since I/O are asynchronous, you have to call over once the I/O request is over, that is to say in an event handler or completion callback.

```javascript
var fs = require('fs');
queue.perform(function(over) {
    console.log("Reading file...");
    fs.readFile('README.md', function(err, result) {
        console.log("Over !");
        if(err) {
            console.error(err);
        } else {
            stdout.write(result);
        }
        over();
    });
});
```

Of course you can name the over function any way you want. Other similar libraries like to call it `done`.

### Passing parameters to jobs

Before 0.4.0, jobs where function that could only take one parameter, the `over()` function. This forced any job parameters to be passed through the closure mechanism, which may have undesirable memory or performance downsides.

From 0.4.0, you can pass additional arguments to the `perform()` call and they will be passed right along to your job, before the over function. Internally the data stored in the queue is `[job, arg1, arg2...]` so no surprises regarding memory usage.

Here is a sample of parameter passing :

```javascript
// Note how the over function is passed as the last parameter
function myJob(word1, word2, over) {
    console.log('' + word1 + ', ' + word2 + ' !');
    over();
}

queue.perform(myJob, 'Hello', 'world');
queue.perform(myJob, 'Howdy', 'pardner');
```

### Waiting for all jobs to be over

When queuing a bunch of jobs, it is often required to wait for all jobs to complete before continuing a process. For that you use the `whenDone()` method :

```javascript
function myJob(name, over) {
    var duration = Math.floor(Math.random() * 1000);
    console.log("Starting "+name+" for "+duration+"ms");
    setTimeout(function() {
        console.log(name + " over, duration="+duration+"ms");
        over();
    }, duration);
}

var i;
for(i=0;i<1000;i++) {
    queue.perform(myJob, "job-"+i);
}
queue.whenDone(function() {
    console.log("All done !");
});
```

The `whenDone()` method can be called multiple times to register multiple handlers, and the handlers will be called in the same order they were added. Maybe I should have used the `EventEmitter` pattern for this.

From 0.4.1 the situation when `whenDone` callbacks are called is more precise.

The `whenDone` callbacks will be called :
- when the last job from the queue is over
- when you call `doneAddingJobs()` and no job was performed since the last `whenDone` situation

This is required to handle the case when a queue may or may not receive jobs, and you want cleanup callbacks to be called in both situations. In this case you would do :

```javascript
function myJob(name, over) {
    var duration = Math.floor(Math.random() * 1000);
    console.log("Starting "+name+" for "+duration+"ms");
    setTimeout(function() {
        console.log(name + " over, duration="+duration+"ms");
        over();
    }, duration);
}

var i;
// In some cases you can have no queued jobs
for(i=0;i<Math.random(10);i++) {
    queue.perform(myJob, "job-"+i);
}
queue.whenDone(function() {
    console.log("All done with "+i+" jobs !");
});

// This does nothing if jobs where added to the queue
// If no jobs where added, the whenDone callbacks are called
queue.doneAddingJobs();
```

Calling `doneAddingJobs()` is not mandatory : it's just needed if you want to make sure the `whenDone` callbacks are called even if no job was effectively done.

### Holding and resuming jobs execution

Since capisce 0.2.0, if you want to fill in the queue first, then launch jobs later, you can use the hold and go methods :

```javascript
queue.hold(); // Hold queue processing
for(i=0;i<1000;i++) {
    queue.perform(myJob, "job-"+i);
}
queue.go(); // Resume queue processing
```

### Scheduling jobs for later

Since capisce 0.3.0, you can use the `wait()` method as a convenient way to include delays into job execution.

```javascript
var queue = new WorkingQueue(1); // Basically, a sequence

queue.perform(function(over) {
    console.log("Waiting 5 seconds...");
    over();
}).wait(5000).perform(function(over) {
    console.log("done !");
    over();
});
```

Of course the above example would be useless with some concurrency in the queue. If you want concurrency, you can pass a job parameter to `wait()` :

```javascript
var queue = new WorkingQueue(16);

queue.perform(function(over) {
    console.log("First job done");
    over();
}).wait(5000, function(over) {
    console.log("Second job started after 5 seconds");
    over();
});
```

The CollectingWorkingQueue class
--------------------------------

This is just a wrapper around `WorkingQueue` that do the very common task of collecting result of each job. When using `CollectingWorkingQueue`, the over function takes the `err, result` of the job as parameters, and the `wellDone` handler receive the array of job results (as `[jobId, err, result]` sub-arrays). It is your choice to sort this array if you want to have results in the same orders the jobs where submitted.

Note : before version 0.4.5, the sample below had a bug. 

```javascript
var queue2 = new CollectingWorkingQueue(16);

function myJob(name) {
    return function(over) {
        var duration = Math.floor(Math.random() * 1000);
        console.log("Starting "+name+" for "+duration+"ms");
        setTimeout(function() {
            console.log(name + " over, duration="+duration+"ms");
            over(null, "result-"+name);
        }, duration);
    };
}

var i;
for(i=0;i<1000;i++) {
    queue.perform(myJob("job-"+i));
}
queue.whenDone(function(results) {
    console.log("All done !");

    console.log("Before sorting : ")
    console.log(results[0]);
    console.log(results[999]);

    results.sort()
    console.log("After sorting : ")
    console.log(results[0]);
    console.log(results[999]);
});
```
Since capisce 0.4.5, you can pass parameters to jobs,  just like you would do with a standard `WorkingQueue`. Once again, this saves you from using function builders (however there are closure built behind the scene).

```javascript
var queue2 = new CollectingWorkingQueue(16);

function myJob(name, over) {
    var duration = Math.floor(Math.random() * 1000);
    console.log("Starting "+name+" for "+duration+"ms");
    setTimeout(function() {
        console.log(name + " over, duration="+duration+"ms");
        over(null, "result-"+name);
    }, duration);
}

var i;
for(i=0;i<1000;i++) {
    queue.perform(myJob, "job-"+i);
}
queue.whenDone(function(results) {
    console.log("All done !");

    console.log("Before sorting : ")
    console.log(results[0]);
    console.log(results[999]);

    results.sort()
    console.log("After sorting : ")
    console.log(results[0]);
    console.log(results[999]);
});
```

Also since capisce 0.4.5, you can call `CollectingWorkingQueue.hold()` and `CollectingWorkingQueue.go()` just like with `WorkingQueue`.

Higher order constructs : sequence and then
----------------------------------------------------------

`capisce.sequence()` can be used as a shorcut :

```javascript
// Those three block codes are equivalent :

// Basic version
var queue = new capisce.WorkingQueue(1);
queue.perform(job1);
queue.perform(job2);
queue.perform(job3);

// Using capisce.sequence() :
capisce.sequence().perform(job1).then(job2).then(job3);

// capisce.sequence() accepts a job as parameter :
capisce.sequence(job1).then(job2).then(job3);

// capisce.sequence() also accepts job parameters.
// By the way, perform is good to use, too
capisce.sequence(job1, param1).then(job2).perform(job3, param2);
```

For now, `then()` doesn't accept job parameters like `perform()`. This is due to a feature that I'd rather remove in the near future, that allows `then()` to create concurrent blocks within a sequence.

Change Log
----------
 
* 0.4.5 (2012-08-28) : `CollectingWorkingQueue.perform()` now accepts parameters for the job, just like `WorkingQueue.perform()`. Added `WorkingQueue.hold()` and `WorkingQueue.go()`. Fixed a bug wherein the (optional) job passed to `sequence()` was not scheduled.
* 0.4.4 (2012-08-28) : wrote proper unit tests using mocha (`npm test` to launch them).
* 0.4.3 (2012-05-03) : with the help of @penartur, fixed a problem where a single worker was launched after a `WorkingQueue.hold()` / `WorkingQueue.go()` sequence.
* 0.4.2 (2012-03-16) : fixed a problem with `WorkingQueue.whenDone()`.
* 0.4.1 (2012-03-15) : clarified behavior of `WorkingQueue.whenDone()` and added `WorkingQueue.doneAddingJobs()`
* 0.4.0 (2012-02-15) : `WorkingQueue.perform()` now accepts extra parameters that are passed to the job when it is scheduled.
* 0.3.1 (2012-02-12) : new behavior for `WorkingQueue.whenDone()`, not so satisfying.
* 0.3.0 (2012-02-10) : Added the `WorkingQueue.wait()` method.
* 0.2.0 (2012-02-10) : Added `WorkingQueue.hold()` and `WorkingQueue.go()` methods.
* 0.1.0 (2012-02-09) : Initial version.