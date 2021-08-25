import { schema, logga } from '@stencila/executa'
import { Jupita } from '.'

// To keep runs fast, only have one instance of Jupita, and thus
// only one Jupyter kernel
const jupita = new Jupita()

// Ensure that the kernel is cleanly shutdown at the end
afterAll(async () => await jupita.stop())

// Replace log handler to record last entry so
// it can be used in expectations
let lastLog: any
logga.replaceHandlers((data) => {
  console.info(data)
  lastLog = data
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

describe('execute', () => {
  let chunk, expr

  test('basic', async () => {
    // Execute code expression
    expr = await jupita.execute(
      schema.codeExpression({
        text: '2 * 2 - 1',
        programmingLanguage: 'python',
      })
    )
    expect(expr.errors).toEqual([])
    expect(expr.output).toEqual(3)

    // Execute code chunk
    chunk = await jupita.execute(
      schema.codeChunk({
        text: '2 * 2 - 1',
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([])
    expect(chunk.outputs).toEqual([3])

    // Attempt to execute a non-executable node
    const para = schema.paragraph({ content: ['Nothing happens to this'] })
    expect(await jupita.execute(para)).toEqual(para)
  })

  test('text outputs', async () => {
    // Execute chunk returning JSONable console results
    chunk = await jupita.execute(
      schema.codeChunk({
        text: `6 * 7`,
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([])
    expect(chunk.outputs).toEqual([42])

    // Execute chunk returning non-JSONable console results
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
  })

  test('image outputs', async () => {
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
  })

  test('stream outputs', async () => {
    // A stdout output is parsed as JSON if possible
    chunk = await jupita.execute(
      schema.codeChunk({
        text: `print([3.14, 42, {}])`,
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([])
    expect(chunk.outputs).toEqual([[3.14, 42, {}]])

    // Multiple stdout outputs are merged
    chunk = await jupita.execute(
      schema.codeChunk({
        text: `
print(1)
import sys; sys.stdout.write('a')
print(3)
`,
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([])
    expect(chunk.outputs).toEqual(['1\na3\n'])

    // Stderr goes to erros
    chunk = await jupita.execute(
      schema.codeChunk({
        text: `
import sys; sys.stderr.write('An error!')
`,
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([
      schema.codeError({ errorMessage: 'An error!' }),
    ])
    expect(chunk.outputs).toEqual([
      9, // The write() returns the number of bytes written
    ])
  })

  test('errors', async () => {
    // Execute code expression with syntax error
    expr = await jupita.execute(
      schema.codeExpression({
        text: '^%$@%$@^$$&*! @-',
        programmingLanguage: 'python',
      })
    )
    expect(expr.errors).toEqual([
      schema.codeError({
        errorMessage: 'SyntaxError: invalid syntax (<string>, line 1)',
      }),
    ])

    // Execute code expression with runtime error
    expr = await jupita.execute(
      schema.codeExpression({
        text: '1 + foo',
        programmingLanguage: 'python',
      })
    )
    expect(expr.errors).toEqual([
      schema.codeError({
        errorMessage: "NameError: name 'foo' is not defined",
      }),
    ])

    // Execute code chunk with error
    chunk = await jupita.execute(
      schema.codeChunk({
        text: 'bar = foo',
        programmingLanguage: 'python',
      })
    )
    expect(chunk.errors).toEqual([
      schema.codeError({
        errorMessage: "NameError: name 'foo' is not defined",
      }),
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

  test('unknown language', async () => {
    // Attempt to execute a non existent language
    // Do this in a new local Jupita instance otherwise get a different
    // error message about the language not matching that of the kernel
    const jupita = new Jupita()
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
    await jupita.stop()
  })
})

describe('unbundle', () => {
  test('plotly', () => {
    const image = jupita.unbundle({
      'application/vnd.plotly.v1+json': {},
    })
    expect(schema.isA('ImageObject', image)).toBe(true)
    if (schema.isA('ImageObject', image)) {
      expect(image.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mediaType: 'application/vnd.plotly.v1+json',
            data: {},
          }),
        ])
      )
      expect(image.contentUrl).toMatch(`https://via.placeholder.com`)
    }
  })

  test('vega', () => {
    const image = jupita.unbundle({
      'application/vnd.vegalite.v4+json': {},
    })
    expect(schema.isA('ImageObject', image)).toBe(true)
    if (schema.isA('ImageObject', image)) {
      expect(image.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mediaType: 'application/vnd.vegalite.v4+json',
            spec: {},
          }),
        ])
      )
      expect(image.contentUrl).toMatch(`https://via.placeholder.com`)
    }
  })

  test.each([['image/png'], ['image/jpeg'], ['image/gif']])(
    '%s',
    (mediaType) => {
      const image = jupita.unbundle({
        [mediaType]: 'data',
      })
      expect(schema.isA('ImageObject', image)).toBe(true)
      if (schema.isA('ImageObject', image)) {
        expect(image.contentUrl).toMatch(`data:${mediaType};base64,data`)
      }
    }
  )

  test.each([
    ['42', 42],
    ['3.14', 3.14],
    ['[1,2,3]', [1, 2, 3]],
    ['foo', 'foo'],
  ])('text: %s', (text, expected) => {
    expect(jupita.unbundle({ 'text/plain': text })).toEqual(expected)
  })

  test('text/html', () => {
    expect(
      jupita.unbundle({
        'text/html': '<p></p>',
      })
    ).toEqual('')
    expect(lastLog).toEqual({
      tag: 'jupita',
      level: logga.LogLevel.warn,
      message: 'Unable to decode MIME bundle with keys text/html',
    })
  })
})
