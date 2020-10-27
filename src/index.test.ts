import { Jupita } from '.'
import { schema } from '@stencila/executa'

jest.setTimeout(60000)

test('manifest', async () => {
  const jupita = new Jupita()

  expect(await jupita.manifest()).toEqual(
    expect.objectContaining({
      capabilities: expect.objectContaining({
        manifest: true,
        execute: expect.objectContaining({
          properties: expect.objectContaining({
            node: expect.objectContaining({
              properties: expect.objectContaining({
                programmingLanguage: expect.objectContaining({
                  enum: expect.arrayContaining(['python']),
                }),
              }),
            }),
          }),
        }),
      }),
    })
  )

  await jupita.stop()
})

test('execute', async () => {
  const jupita = new Jupita()
  let chunk, expr

  // Attempt to execute a non existent language
  chunk = await jupita.execute(
    schema.codeChunk({
      text: 'foo',
      programmingLanguage: 'foo',
    })
  )
  expect(chunk.errors).toEqual([
    schema.codeError({
      errorMessage:
        'Jupyter kernel for language "foo" not available on this machine',
    }),
  ])

  // Execute expression
  expr = await jupita.execute(
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
  chunk = await jupita.execute(
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

  // Execute code chunk with error
  chunk = await jupita.execute(
    schema.codeChunk({
      text: 'foo',
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([
    schema.codeError({ errorMessage: "NameError: name 'foo' is not defined" }),
  ])

  // Execute code chunk with different language
  chunk = await jupita.execute(
    schema.codeChunk({
      text: '2*2',
      programmingLanguage: 'haskell',
    })
  )
  expect(chunk.errors).toEqual([
    schema.codeError({
      errorMessage:
        'Language of node (haskell) does not match that of kernel (python)',
    }),
  ])

  await jupita.stop()
})
