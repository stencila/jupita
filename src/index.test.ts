import { Jupita } from '.'

jest.setTimeout(60000)

test('JupyterContext', async () => {
  await Jupita.discover()

  // These tests can only be run if at least one Jupyter kernel is installed
  console.log(
    'JupyterContext.spec.kernels: ' +
      JSON.stringify(Object.keys(Jupita.kernels))
  )
  if (Object.keys(Jupita.kernels).length < 1) {
    return
  }

  const context = new Jupita({
    language: 'python',
    debug: false,
    timeout: 5,
  })

  console.log('JupyterContext.kernel: ' + context.kernel)

  await context.initialize()
  console.log('JupyterContext._config: ' + JSON.stringify(context.config))
  console.log(
    'JupyterContext._kernelInfo: ' + JSON.stringify(context.kernelInfo)
  )
  expect(context.connectionFile).toBeTruthy()
  expect(context.process).toBeTruthy()

  let cell

  // Execute expression
  cell = await context.execute({
    expr: true,
    source: {
      type: 'string',
      data: '2 * 2 - 1',
    },
  })
  expect(cell.messages).toEqual([])
  expect(cell.outputs[0]).toEqual({
    value: 3,
  })

  // Execute expression with runtime error
  cell = await context.execute({
    expr: true,
    source: {
      type: 'string',
      data: '1 + foo',
    },
  })
  expect(cell.messages).toEqual([
    { type: 'error', message: "NameError: name 'foo' is not defined" },
  ])

  // Execute block returning a JSONable console result
  cell = await context.execute('print(22)\n6 * 7\n')
  expect(cell.messages).toEqual([])
  expect(cell.outputs[0]).toEqual({
    value: 42,
  })

  // Execute block returning a non-JSONable console result
  cell = await context.execute(
    'import datetime\ndatetime.datetime(2018, 5, 23)\n'
  )
  expect(cell.messages).toEqual([])
  expect(cell.outputs[0]).toEqual({
    value: 'datetime.datetime(2018, 5, 23, 0, 0)',
  })

  // Execute block returning an image
  cell = await context.execute(`
import matplotlib.pyplot as plt
plt.scatter([1, 2, 3], [1, 2, 3])
plt.show()
`)
  // Without `%matplotlib inline` magic we get a text rep
  // Fails on Travis, https://travis-ci.org/stencila/node/builds/382500487#L2782, (but not locally on Linux) so skipping for now
  // assert.ok(cell.outputs[0].value.data.match(/^<matplotlib\.figure\.Figure/))

  cell = await context.execute(`
%matplotlib inline
plt.show()
`)
  // Adding `%matplotlib inline` currently doesn't work as expected
  // assert.equal(cell.outputs[0].value.type, 'image')

  // Execute block with error
  cell = await context.execute('foo')
  expect(cell.messages).toEqual([
    { type: 'error', message: "NameError: name 'foo' is not defined" },
  ])

  context.finalize()
})
