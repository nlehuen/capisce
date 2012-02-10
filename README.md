capisce
=======

This module implements an asynchronous job queueing system with the WorkingQueue class. Jobs are processed concurrently up to a given degree of "concurrency" ; of course, if this degree is 1, then jobs are processed sequentially.

The basic use case of this module is when you want to perform a bunch (hundreds or thousands) of I/O related tasks, for instance HTTP requests. In order to play nice with others and make sure the I/O stack (file descriptors, TCP/IP stack etc.) won't be submerged by thousands of concurrent requests, you have to put an artificial limit on the requests that are launched concurrently. When this limit is reached, jobs have to be queued until some other job is finished. And that's exactly what WorkingQueue is for !

The WorkingQueue class
----------------------

This class is instanciated with a single parameter : the concurrency level of the queue. Again, if the concurrency level is 1, then it means that all jobs will be processed sequentially.

```javascript
var WorkingQueue = require('capisce').WorkingQueue;
var queue = new WorkingQueue(16);
```

You can then launch jobs using the perform method. If the current concurrency limit has not been reached, then the job will be scheduled immediatly. Otherwise, it is queued for later execution.

Jobs are simple function that are passed a very important parameter : the over function. The job MUST call the over function at the end of its process to signal the WorkingQueue that it is, well, over.

```javascript
queue.perform(function(over) {
    console.log("Hello, world !");
    over();
});
```

The over function can be passed around inside your job. In fact it's the only way to perform interesting things : since I/O are asynchronous, you have to call over once the I/O request is over, that is to say in an event handler or completion callback.

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

When queuing a bunch of jobs, it is often required to wait for all jobs to complete before continuing a process. For that you use the whenDone method :

```javascript
function myJob(name) {
    return function (over) {
        var duration = Math.floor(Math.random() * 1000);
        console.log("Starting "+name+" for "+duration+"ms");
        setTimeout(function() {
            console.log(name + " over, duration="+duration+"ms");
            over();
        }, duration);
    };    
}

var i;
for(i=0;i<1000;i++) {
    queue.perform(myJob("job-"+i));
}
queue.whenDone(function() {
    console.log("All done !");
});
```

The whenDone method can be called multiple times to register multiple handlers, and the handlers will be called in the same order they were added. Maybe I should have used the EventEmitter pattern for this.

Since capisce 0.2.0, if you want to fill in the queue first, then launch jobs later, you can use the hold and go methods :

```javascript
queue.hold(); // Hold queue processing
for(i=0;i<1000;i++) {
    queue.perform(myJob("job-"+i));
}
queue.go(); // Resume queue processing
```

The CollectingWorkingQueue class
--------------------------------

This is just a wrapper around WorkingQueue that do the very common task of collecting result of each job. When using CollectingWorkingQueue, the over function takes the err, result of the job as parameters, and the wellDone handler receive the array of job results (as [jobId, err, result] sub-arrays). It is your choice to sort this array if you want to have results in the same orders the jobs where submitted.

```javascript
var queue2 = new CollectingWorkingQueue(16);

function myJob(name) {
    return function (over) {
        var duration = Math.floor(Math.random() * 1000);
        console.log("Starting "+name+" for "+duration+"ms");
        setTimeout(function() {
            console.log(name + " over, duration="+duration+"ms");
            over(null, "result-"+name);
        }, duration);
    }    
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

Higher order constructs : sequence, concurrently, and then
------------------------------------------------------

capisce exports the sequence and concurrently function, as well as the then method in order to provide a small DSL for asynchronous workflows, without exposing the gory details of WorkingQueue. See tests/test2.js until I write some proper doc for this.
