import { schema } from '@stencila/executa'
import { Jupita } from '.'

jest.setTimeout(60000)

let jupita: Jupita

beforeEach(() => {
  jupita = new Jupita()
})

afterEach(async () => {
  await jupita.stop()
})

test('manifest', async () => {
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
})

test('execute', async () => {
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
      text: `
print(22)
6 * 7
`,
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([])
  expect(chunk.outputs).toEqual([22, 42])

  // Execute block returning a non-JSONable console result
  chunk = await jupita.execute(
    schema.codeChunk({
      text: `
import datetime
datetime.datetime(2018, 5, 23)
`,
      programmingLanguage: 'python',
    })
  )
  expect(chunk.errors).toEqual([])
  expect(chunk.outputs).toEqual(['datetime.datetime(2018, 5, 23, 0, 0)'])

  // Execute block returning an image
  chunk = await jupita.execute(
    schema.codeChunk({
      text: `
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 2, 3])
plt.show()
`,
      programmingLanguage: 'python',
    })
  )
  expect(chunk?.outputs?.length).toEqual(1)
  expect(chunk.outputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'ImageObject',
        contentUrl: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    ])
  )

  // Execute block returning multiple images
  chunk = await jupita.execute(
    schema.codeChunk({
      text: `
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 2, 3]); plt.show()
plt.plot([1, 2, 3], [1, 2, 3]); plt.show()
plt.plot([1, 2, 3], [1, 2, 3]); plt.show()
`,
      programmingLanguage: 'python',
    })
  )
  expect(chunk?.outputs?.length).toEqual(3)
  expect(chunk?.outputs?.[2]).toEqual(
    expect.objectContaining({
      type: 'ImageObject',
      contentUrl: expect.stringMatching(/^data:image\/png;base64,/),
    })
  )

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
})
