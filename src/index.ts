#!/usr/bin/env node

import {
  Capabilities,
  cli,
  JSONSchema7,
  Listener,
  logga,
  schema,
  Server,
  StdioServer,
} from '@stencila/executa'
import crypto from 'crypto'
import fs from 'fs'
// @ts-ignore
import jmp from 'jmp'
// @ts-ignore
import kernelspecs from 'kernelspecs'
// @ts-ignore
import spawnteract from 'spawnteract'

// Disable camel case check because camel casing is used quite a bit in JMP API
/* eslint-disable camelcase */

const log = logga.getLogger('jupita')

export class Jupita extends Listener {
  /**
   * A map of the specifications of Jupyter kernels available
   * on this machine.
   */
  kernels: any = {}

  /**
   * The language for the current session.
   */
  language?: string

  // Properties related to the current kernel.
  process: any
  connectionFile: any
  config: any
  spec: any
  shellSocket: any
  ioSocket: any
  kernelInfo: any

  // Properties that allow determination of when a request has finished
  requestId?: string
  requestReply = false
  requestIdle = false
  requestResolve?: () => void

  // Outputs and errors for the current execution request
  outputs: any[] = []
  errors: schema.CodeError[] = []

  /**
   * Construct a Jupyter executor.
   *
   * New Jupyter execution contexts can be constructed using the `language` option which will
   * search for a kernel with a matching lowercased `language` property:
   *
   *     new JupyterContext({language:'r'})
   *
   * Alternatively, you can specify a kernel directly:
   *
   *     new JupyterContext({kernel:'ir'})
   *
   * See https://github.com/jupyter/jupyter/wiki/Jupyter-kernels for a list of available
   * Jupyter kernels.
   *
   * @param options Options e.g for specifying which kernel to use
   */
  constructor(
    servers: Server[] = [
      new StdioServer({ command: 'node', args: [__filename, 'start'] }),
    ]
  ) {
    super('ju', servers)
  }

  /**
   * @override Override of `Executor.capabilities` to
   * define this interpreter's capabilities.
   */
  public async capabilities(): Promise<Capabilities> {
    const kernelSpecs = await this.findKernels()
    const params: JSONSchema7 = {
      required: ['node'],
      properties: {
        node: {
          required: ['type', 'programmingLanguage', 'text'],
          properties: {
            type: {
              enum: ['CodeChunk', 'CodeExpression'],
            },
            programmingLanguage: {
              enum: Object.keys(kernelSpecs),
            },
            text: {
              type: 'string',
            },
          },
        },
      },
    }
    return Promise.resolve({
      manifest: true,
      execute: params,
    })
  }

  /**
   * @override Override of `Executor.execute` that executes code in a Jupyter kernel.
   *
   * For cells with `CodeExpression` nodes utilizes `user_expressions` property of
   * an `execute_request` to evaluate expression side-effect free.
   */
  public async execute<Type extends schema.Node>(node: Type): Promise<Type> {
    let language
    let code
    let expressions
    if (schema.isA('CodeExpression', node)) {
      language = node.programmingLanguage
      code = ''
      expressions = {
        value: node.text,
      }
    } else if (schema.isA('CodeChunk', node)) {
      language = node.programmingLanguage
      code = node.text
      expressions = {}
    } else {
      return node
    }

    this.outputs = []
    this.errors = []
    try {
      if (this.language !== undefined) {
        if (language !== this.language) {
          throw new Error(
            `Language of node (${language}) does not match that of kernel (${this.language})`
          )
        }
      } else {
        await this.startKernel(language ?? 'python')
      }

      await this.shellRequest('execute_request', {
        // Source code to be executed by the kernel, one or more lines.
        code: code,

        // A boolean flag which, if True, signals the kernel to execute
        // this code as quietly as possible.
        // silent=True forces store_history to be False,
        // and will *not*:
        //   - broadcast output on the IOPUB channel
        //   - have an execute_result
        // The default is False.
        silent: false,

        // A boolean flag which, if True, signals the kernel to populate history
        // The default is True if silent is False.  If silent is True, store_history
        // is forced to be False.
        store_history: true,

        // A dict mapping names to expressions to be evaluated in the
        // user's dict. The rich display-data representation of each will be evaluated after execution.
        // See the display_data content for the structure of the representation data.
        user_expressions: expressions,

        // Some frontends do not support stdin requests.
        // If this is true, code running in the kernel can prompt the user for input
        // with an input_request message (see below). If it is false, the kernel
        // should not send these messages.
        allow_stdin: false,

        // A boolean flag, which, if True, does not abort the execution queue, if an exception is encountered.
        // This allows the queued execution of multiple execute_requests, even if they generate exceptions.
        stop_on_error: false,
      })
    } catch (error) {
      // Some other error happened...
      this.errors.push(
        schema.codeError({
          errorMessage: error.message,
        })
      )
    }

    if (schema.isA('CodeExpression', node)) {
      // @ts-ignore
      return { ...node, output: this.outputs[0], errors: this.errors }
    } else {
      // @ts-ignore
      return { ...node, outputs: this.outputs, errors: this.errors }
    }
  }

  /**
   * @override Override of `Listener.stop` to
   * stop the kernel as well as servers.
   */
  public stop(): Promise<void> {
    log.debug(`Stopping kernel`)
    if (this.shellSocket !== undefined) {
      this.shellSocket.removeAllListeners('message')
      this.shellSocket.close()
      this.shellSocket = null
    }
    if (this.ioSocket !== undefined) {
      this.ioSocket.removeAllListeners('message')
      this.ioSocket.close()
      this.ioSocket = null
    }
    if (this.process !== undefined) {
      this.process.kill()
      this.process = null
    }
    if (this.connectionFile !== undefined) {
      fs.unlinkSync(this.connectionFile)
      this.connectionFile = null
    }
    this.config = null
    this.spec = null

    return super.stop()
  }

  /**
   * Find Jupyter kernels that are installed on this machine.
   */
  private async findKernels(): Promise<Record<string, any>> {
    if (Object.keys(this.kernels).length === 0) {
      const kernelSpecs = await kernelspecs.findAll()
      this.kernels = Object.values(kernelSpecs).reduce(
        (prev: Record<string, any>, curr: any) => {
          const language = curr?.spec?.language?.toLowerCase()
          return typeof language === 'string'
            ? { ...prev, [language]: curr }
            : prev
        },
        {}
      )
    }
    return this.kernels
  }

  /**
   * Start a Jupyter kernel.
   */
  private async startKernel(language: string): Promise<void> {
    const kernelSpecs = await this.findKernels()
    if (Object.keys(kernelSpecs).length === 0) {
      throw new Error('No Jupyter kernels available on this machine')
    }
    if (!(language in kernelSpecs)) {
      throw new Error(
        `Jupyter kernel for language "${language}" not available on this machine`
      )
    }

    // Pass `kernels` to `launch()` as an optimization to prevent another kernelspecs
    // search of the filesystem
    const kernel = await spawnteract.launch(language, {}, kernelSpecs)
    this.language = language
    this.process = kernel.spawn // The running process, from child_process.spawn(...)
    this.connectionFile = kernel.connectionFile // Connection file path
    this.config = kernel.config // Connection information from the file
    this.spec = kernel.kernelSpec

    const { transport, ip, key, shell_port, iopub_port } = this.config
    const origin = `${transport}://${ip}`

    // Shell socket for execute, and other, request
    this.shellSocket = new jmp.Socket('dealer', 'sha256', key)
    this.shellSocket.connect(`${origin}:${shell_port}`)
    this.shellSocket.on('message', this.shellResponse.bind(this))

    // IOPub socket for receiving updates
    this.ioSocket = new jmp.Socket('sub', 'sha256', key)
    this.ioSocket.connect(`${origin}:${iopub_port}`)
    this.ioSocket.on('message', this.ioResponse.bind(this))
    this.ioSocket.subscribe('') // Subscribe to all topics

    // Wait an arbitrary amount of time for the kernel and
    // messaging to startup. This is an attempt to resolve issues
    // seen on CI where the first test timed out but subsequent tests passed
    // and in production occasionally on first code execution.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Get kernel info mainly to confirm communication with kernel is working
    return this.shellRequest('kernel_info_request')
  }

  /**
   * Send a request message to the kernel on the `shell` channel
   *
   * See https://jupyter-client.readthedocs.io/en/stable/messaging.html#messages-on-the-shell-router-dealer-channel
   *
   * @param  type     Type of request e.g. 'execute_request'
   * @param  content  Content of request message
   * @param  timeout  Seconds before the request should resolve regardless on whether
   *                  confirmation messages are received from the kernel.
   */
  private shellRequest(
    type: string,
    content: Record<string, any> = {},
    timeout = 0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomBytes(18).toString('hex')

      const request = new jmp.Message()
      request.idents = []
      request.header = {
        msg_type: type,
        msg_id: id,
        session: this.id,
        username: 'user',
        version: '5.2',
      }
      request.parent_header = {}
      request.metadata = {}
      request.content = content

      // console.debug(`shellRequest: ${id} ${type}`)

      this.requestId = id
      this.requestReply = false
      this.requestIdle = false
      this.requestResolve = resolve
      this.shellSocket.send(request)

      if (timeout > 0)
        setTimeout(() => {
          this.resolve(true)
        }, timeout * 1000)
    })
  }

  /**
   * Receive a response message from the kernel on the `shell` channel.
   *
   * @param  response Response message
   */
  private shellResponse(response: any): void {
    const requestId = response.parent_header.msg_id
    const replyType = response.header.msg_type
    const content = response.content

    // console.debug(`shellResponse: ${requestId} ${replyType}`)

    if (requestId === this.requestId) {
      if (replyType === 'execute_reply') {
        const result = content?.user_expressions?.value
        if (result !== undefined) {
          const { status, data, ename, evalue } = result
          if (status === 'ok') {
            this.outputs.push(this.unbundle(data))
          } else if (status === 'error') {
            this.errors.push(
              schema.codeError({
                errorMessage: `${ename}: ${evalue}`,
              })
            )
          }
        }
      } else if (replyType === 'kernel_info_reply') {
        this.kernelInfo = content
      }
      this.requestReply = true
      this.resolve()
    }
  }

  /**
   * Receive a response message from the kernel on the `IOPub` channel.
   *
   * See https://jupyter-client.readthedocs.io/en/stable/messaging.html#messages-on-the-iopub-pub-sub-channel
   *
   * @param  response Response message
   */
  private ioResponse(response: any): void {
    const requestId = response.parent_header.msg_id
    const replyType = response.header.msg_type
    const content = response.content
    const state = content.execution_state

    // console.debug(`ioResponse: ${requestId} ${replyType} ${state}`)

    if (requestId === this.requestId) {
      if (replyType === 'status' && state === 'idle') {
        this.requestIdle = true
        this.resolve()
      } else if (replyType === 'stream') {
        const { name, text } = content
        if (name === 'stdout') {
          let value
          try {
            value = JSON.parse(text)
          } catch (error) {
            value = text
          }
          this.outputs.push(value)
        } else if (name === 'stderr')
          this.errors.push(schema.codeError({ errorMessage: text }))
      } else if (
        replyType === 'display_data' ||
        replyType === 'execute_result'
      ) {
        // Unbundle the execution result into the outputs
        this.outputs.push(this.unbundle(content.data))
      } else if (replyType === 'error') {
        // Add an error message to the cell
        const { ename, evalue } = content
        this.errors.push(
          schema.codeError({
            errorMessage: `${ename}: ${evalue}`,
          })
        )
      }
    }
  }

  /**
   * Resolve a request if a reply has been received and state is idle.
   */
  private resolve(force = false): void {
    if (force || (this.requestReply && this.requestIdle)) {
      this.requestResolve?.()
    }
  }

  /**
   * Convert a "MIME bundle" within a JMP message (e.g. a `execute_result` or
   * `display data` message) into a data node.
   *
   * This method serves the same function, as `decodeMimeBundle` in Encoda
   * https://github.com/stencila/encoda/blob/656d26f5387d14f0d3071614cdbf0403eb18be31/src/codecs/ipynb/index.ts#L675
   * but only deals with version 4 of the protocol and handles fewer MIME types.
   *
   * Also, it preferentially extracts "richer" media types for the bundle
   * (e.g. images before plain text representations of images).
   *
   * @param  bundle A JMP MIME bundle
   * @return A Stencila Schema node
   */
  public unbundle(bundle: Record<string, any>): schema.Node {
    const plotly = bundle['application/vnd.plotly.v1+json']
    if (plotly !== undefined) {
      // A Plotly, interactive image.
      // A `contentUrl` is required and using an empty string can cause
      // problems elsewhere. So we use a placeholder which also tells the user
      // if there were issues rendering the Plotly data.
      return schema.imageObject({
        content: [
          { mediaType: 'application/vnd.plotly.v1+json', data: plotly },
        ],
        contentUrl:
          'https://via.placeholder.com/400x60?text=Unable%20to%20render%20Plotly%20output',
      })
    }

    for (const mediaType of ['image/png', 'image/jpeg', 'image/gif']) {
      const image = bundle[mediaType]
      if (image !== undefined) {
        // A plain, static image
        return schema.imageObject({
          contentUrl: `data:${mediaType};base64,${image}`,
        })
      }
    }

    const text = bundle['text/plain']
    if (text !== undefined) {
      // Attempt to parse plain text as a number, object etc
      const content =
        typeof text === 'string'
          ? text
          : Array.isArray(text)
          ? text.join('')
          : text.toString()
      try {
        return JSON.parse(content)
      } catch (error) {
        return content
      }
    }

    log.warn(
      `Unable to decode MIME bundle with keys ${Object.keys(bundle).join(',')}`
    )
    return ''
  }
}

// istanbul ignore next
if (require.main === module)
  cli.main(new Jupita()).catch((error) => log.error(error))
