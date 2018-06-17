//By 2018 Yuoa.

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var randname = require('node-random-name');

app.get('/', function(I, O) { O.sendFile(__dirname + '/webResc/chat.html'); });

var namePair = {};
var nameList = [];

var callPreparationPair = {};
var callShouldICheckPreparation = {};
var callPreparationCheck = (id, otherID) => {

    if (callShouldICheckPreparation[id] != undefined && callShouldICheckPreparation[id]) {

        io.to(otherID).emit("call preparing timeout");

    }

};

io.on('connection', function(s) {

    //Name initialization
    var tempNPValList = Object.values(namePair);
    while(true) {

      namePair[s.id] = randname({ first: true });
      for(var ix = 0; ix < tempNPValList.length; ix++)
        if(namePair[s.id] == tempNPValList[ix])
          continue;

      break;

    };
    nameList.push(namePair[s.id]);

    //On Disconnection
    s.on('disconnect', function() {

        var callReadyIndex = Object.keys(callPreparationPair).indexOf(s.id);
        if (callReadyIndex != -1) {

            let otherReadyIndex = Object.keys(namePair).indexOf(callPreparationPair[s.id]);

            if(otherReadyIndex != -1) {

                io.to(callPreparationPair[s.id]).emit("call disconnected", [s.id, namePair[s.id]]);
                delete callPreparationPair[callPreparationPair[s.id]];
                delete callShouldICheckPreparation[s.id];

            }

            delete callPreparationPair[s.id];
            delete callShouldICheckPreparation[s.id];

        }

        var tempUserName = namePair[s.id];
        delete namePair[s.id];

        var outIndex = nameList.indexOf(tempUserName);
        if (outIndex != -1)
            nameList.splice(outIndex, 1);

        io.emit("system user out", tempUserName);
        io.emit("call disconnection check", s.id);

        console.log(s.id + "(" + tempUserName + ") left.");

    });

    //Text Messaging
    s.on('message from one', function(msg) {

        io.emit("message to all", {
            "name": namePair[s.id],
            "msg": msg
        });

        console.log(s.id + "(" + namePair[s.id] + ") says: " + msg);

    });

    //Name Changing
    s.on('namechange request now', function() {
        io.to(s.id).emit("namechange response now", namePair[s.id]);
    });
    s.on("namechange request new", function(newName) {

        if (newName == namePair[s.id])
            return io.to(s.id).emit("namechange refused samename", true);
        else if (nameList.indexOf(newName) > -1)
            return io.to(s.id).emit("namechange refused already-in-use", true);

        var oldIndex = nameList.indexOf(namePair[s.id]);
        if (oldIndex != -1)
            nameList.splice(oldIndex, 1);
        nameList.push(newName);

        var oldName= namePair[s.id];
        namePair[s.id] = newName;

        io.emit("system user namechange", {
            "old": oldName,
            "new": newName
        });
        io.to(s.id).emit("namechange success", namePair[s.id]);

        console.log(s.id + "(" + namePair[s.id] + ") changed xir name to " + newName);

    });

    //People-List-Related
    s.on('peoplelist request', function() {
        console.log(nameList);
        io.to(s.id).emit("peoplelist response", nameList);
    });

    //Call-Related
    callShouldICheckPreparation[s.id] = false;
    s.on('call callee-exist request', ([toWhom, isVideoCall]) => {

        var index = Object.values(namePair).indexOf(toWhom.trim());

        if (toWhom == namePair[s.id])
            return io.to(s.id).emit("call callee-exist response", [false, 2]);
        else if (index == -1)
            return io.to(s.id).emit("call callee-exist response", [false, 1]);

        let calleeID = Object.keys(namePair)[index];
        io.to(calleeID).emit("call available request", [s.id, calleeID, isVideoCall]);

    });
    s.on("call available response", ([isAvailable, callInfo]) => {

        if (isAvailable) {

            let theirName = [namePair[callInfo[0]], namePair[callInfo[1]]];

            io.to(callInfo[0]).emit("call establish request", [false, callInfo, theirName]);
            io.to(callInfo[1]).emit("call establish request", [true, callInfo, theirName]);

        } else {

            io.to(callInfo[0]).emit("call available response", [false, namePair[callInfo[1]]]);

        }

    });
    s.on("call establish response", ([isReceived, callInfo, names]) => {

        if (isReceived) {

            io.to(callInfo[0]).emit("call established", [false, callInfo, names]);
            io.to(callInfo[1]).emit("call established", [true, callInfo, names]);
            callShouldICheckPreparation[callInfo[0]] = true;
            callShouldICheckPreparation[callInfo[1]] = true;
            setTimeout(() => {

                callPreparationCheck(callInfo[0], callInfo[1]);
                callPreparationCheck(callInfo[1], callInfo[0]);

            }, 20000);

        } else {

            io.to(callInfo).emit("call establish response");

        }

    });
    s.on("call establish cancel", (calleeID) => { io.to(calleeID).emit("call establish canceled"); });
    s.on("call prepared", (callInfo) => {

        callShouldICheckPreparation[s.id] = false;
        callPreparationPair[s.id] = ((callInfo[0] == s.id) ? callInfo[1] : callInfo[0]);

        let otherState = callShouldICheckPreparation[(callInfo[0] == s.id) ? callInfo[1] : callInfo[0]];
        if (otherState != undefined && !otherState) {

            let hash = Buffer.from(JSON.stringify(callInfo)).toString('base64');
            io.to(callInfo[0]).emit("call start", [true, hash]);
            io.to(callInfo[1]).emit("call start", [false,hash]);

        }

    });
    s.on("call preparing failed", (callInfo) => {
        delete callPreparationPair[callInfo[0]];
        delete callPreparationPair[callInfo[1]];
        callShouldICheckPreparation[callInfo[0]] = false;
        callShouldICheckPreparation[callInfo[1]] = false;
        io.to((callInfo[0] == s.id) ? callInfo[1] : callInfo[0]).emit("call preparing failed", namePair[s.id]);
    });
    s.on("call end", (calleeID) => {
        delete callPreparationPair[s.id];
        delete callPreparationPair[calleeID];
        callShouldICheckPreparation[s.id] = false;
        callShouldICheckPreparation[calleeID] = false;
        io.to(calleeID).emit("call ended", namePair[s.id]);
    });

    //Announce New User!
    io.emit("system user in", namePair[s.id]);

});

http.listen(40003);
