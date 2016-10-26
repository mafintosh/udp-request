# udp-request

Small module for making requests/responses over UDP

```
npm install udp-request
```

[![build status](http://img.shields.io/travis/mafintosh/udp-request.svg?style=flat)](http://travis-ci.org/mafintosh/udp-request)

## Usage

``` js
var udp = require('udp-request')
var socket = udp()

socket.on('request', function (request, peer) {
  console.log('request:', request.toString())
  socket.response('echo: ' + request.toString(), peer)
})

socket.listen(10000, function () {
  socket.request('hello', {port: 10000, host: '127.0.0.1'}, function (err, response) {
    console.log('response', response.toString())
    socket.destroy()
  })
})
```

## API

#### `var socket = udp([options])`

Create a new request/response udp socket. Options include:

``` js
{
  timeout: 1000, // request timeout
  socket: udpSocket, // supply your own udp socket
  retry: true, // retry requests if they time out. defaults to false
  requestEncoding: someEncoder, // abstract-encoding compliant encoder
  responseEncoding: someEncoder, // abstract-encoding compliant encoder
}
```

#### `var id = socket.request(buffer, peer, [options], [callback])`

Send a new request. `buffer` is the request payload and `peer` should be an object containing `{port, host}`.
When the response arrives (or the request times out) the callback is called with the following arguments

``` js
callback(error, response, peer)
```

Options include:

``` js
{
  retry: true
}
```

#### `socket.response(buffer, peer)`

Send a response back to a request.

#### `socket.cancel(id)`

Cancels a pending request.

#### `socket.on('request', buffer, peer)`

Emitted when a new request arrives. Call the above `.response` with the same peer object to send a response back to this request.

#### `socket.on('response', buffer, peer)`

Emitted when any response arrives.

#### `socket.on('error', err)`

Emitted when a critical error happens.

#### `socket.on('warning', err)`

Emitted when a non critical error happens (you usually do not need to listen for this).

#### `socket.on('close')`

Emitted when the request socket closes (after it is destroyed).

#### `socket.on('listening')`

Emitted when the socket is listening.

#### `socket.listen([port], [callback])`

Listen on a specific port. If port is omitted a random one will be used.

#### `socket.destroy()`

Completely destroy the request socket (cancels all pending requests).

## License

MIT
