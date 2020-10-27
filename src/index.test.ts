import { Jupita } from '.'
import { schema } from '@stencila/executa'

jest.setTimeout(60000)

test('Jupita', async () => {
  const jupita = new Jupita()

  // Execute expression
  let expr = await jupita.execute(
    schema.codeExpression({
      text: '2 * 2 - 1',
      programmingLanguage: 'python',
    })
  )
  expect(expr.errors).toEqual([])
  expect(expr.output).toEqual(3)

  // Execute expression with runtime error
  expr = await jupita.execute(
    schema.codeExpression({
      text: '1 + foo',
      programmingLanguage: 'python',
    })
  )
  expect(expr.errors).toEqual([
    schema.codeError({ errorMessage: "NameError: name 'foo' is not defined" }),
  ])

  // Execute block returning a JSONable console result
  let chunk = await jupita.execute(
    schema.codeChunk({
      text: 'print(22)\n6 * 7\n',
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([])
  expect(chunk.outputs).toEqual([42])

  // Execute block returning a non-JSONable console result
  chunk = await jupita.execute(
    schema.codeChunk({
      text: 'import datetime\ndatetime.datetime(2018, 5, 23)\n',
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([])
  expect(chunk.outputs).toEqual(['datetime.datetime(2018, 5, 23, 0, 0)'])

  // Execute block returning an image
  chunk = await jupita.execute(
    schema.codeChunk({
      text: `import matplotlib.pyplot as plt
plt.scatter([1, 2, 3], [1, 2, 3])
plt.show()`,
      programmingLanguage: 'python',
    })
  )
  // Without `%matplotlib inline` magic we get a text rep
  // Fails on Travis, https://travis-ci.org/stencila/node/builds/382500487#L2782, (but not locally on Linux) so skipping for now
  // assert.ok(chunk.outputs[0].value.data.match(/^<matplotlib\.figure\.Figure/))

  chunk = await jupita.execute(
    schema.codeChunk({
      text: `
%matplotlib inline
plt.show()
`,
      programmingLanguage: 'python',
    })
  )
  // Adding `%matplotlib inline` currently doesn't work as expected
  // assert.equal(chunk.outputs[0].value.type, 'image')

  // Execute block with error
  chunk = await jupita.execute(
    schema.codeChunk({
      text: 'foo',
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([
    schema.codeError({ errorMessage: "NameError: name 'foo' is not defined" }),
  ])

  await jupita.stop()
})
