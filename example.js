var udp = require('udp-request')
var socket = udp()

socket.on('request', function (request, peer) {
  console.log('request:', request.toString())
  socket.response('echo: ' + request.toString(), peer)
})

socket.listen(10000, function () {
  socket.request('hello', { port: 10000, host: '127.0.0.1' }, function (err, response) {
    if (err) throw err
    console.log('response', response.toString())
    socket.destroy()
  })
})
