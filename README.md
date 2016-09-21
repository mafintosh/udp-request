# udp-request

Small module for making requests/responses over UDP

```
npm install udp-request
```

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
  socket: udpSocket, // supply your own udp socket
  retry: true // retry requests if they time out. defaults to false
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

#### `socket.listen([port], [callback])`

Listen on a specific port. If port is omitted a random one will be used.

#### `socket.destroy()`

Completely destroy the request socket (cancels all pending requests).

## License

MIT
