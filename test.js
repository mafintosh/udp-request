var tape = require('tape')
var udp = require('./')

tape('request', function (t) {
  var socket = udp()

  socket.on('request', function (value, peer) {
    socket.response(value, peer)
  })

  socket.listen(0, function () {
    socket.request('hello', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      socket.destroy()
      t.error(err, 'no error')
      t.same(echo, new Buffer('hello'), 'echoed data')
      t.end()
    })
  })
})

tape('multiple request', function (t) {
  t.plan(4)

  var socket = udp()

  socket.on('request', function (value, peer) {
    socket.response(value, peer)
  })

  socket.listen(0, function () {
    socket.request('hello', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      if (!socket.inflight) socket.destroy()
      t.error(err, 'no error')
      t.same(echo, new Buffer('hello'), 'echoed data')
    })

    socket.request('hello', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      if (!socket.inflight) socket.destroy()
      t.error(err, 'no error')
      t.same(echo, new Buffer('hello'), 'echoed data')
    })
  })
})

tape('timeout', function (t) {
  var socket = udp()

  socket.listen(0, function () {
    socket.request('hello', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      socket.destroy()
      t.ok(err, 'had timeout')
      t.end()
    })
  })
})

tape('cancel', function (t) {
  var socket = udp()

  socket.listen(0, function () {
    var tid = socket.request('hello', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      socket.destroy()
      t.ok(err, 'was cancelled')
      t.end()
    })

    socket.cancel(tid)
  })
})

tape('forward', function (t) {
  var socket = udp()
  var a = udp()
  var b = udp()

  a.listen()
  b.listen()

  socket.listen(0, function () {
    socket.on('request', function (request, peer) {
      socket.forwardRequest(request, peer, {port: b.address().port, host: '127.0.0.1'})
    })

    a.request('echo me', {port: socket.address().port, host: '127.0.0.1'}, function (err, echo) {
      a.destroy()
      b.destroy()
      socket.destroy()
      t.error(err, 'no error')
      t.same(echo, new Buffer('echo me'), 'echoed data')
      t.end()
    })
  })

  b.on('request', function (request, peer) {
    b.forwardResponse(request, peer, {port: a.address().port, host: '127.0.0.1'})
  })
})
