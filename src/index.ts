#!/usr/bin/env node

import {
  Capabilities,
  CapabilityError,
  cli,
  JSONSchema7,
  Listener,
  logga,
  Method,
  schema,
  Server,
  StdioServer,
  Claims,
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

  /**
   * Timeout for responses from the kernel.
   */
  timeout = -1

  /**
   * A map of requests sent to the kernel
   */
  requests: Record<string, any> = {}

  process: any
  connectionFile: any
  config: any
  spec: any
  shellSocket: any
  ioSocket: any
  kernelInfo: any

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
  public async execute<Type>(
    node: Type,
    session?: schema.SoftwareSession,
    claims?: Claims,
    job?: string
  ): Promise<Type> {
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

    const content = {
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
    }

    const outputs = []
    const errors = []
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

      const response = await this.request('execute_request', content)
      const msgType = response.header.msg_type
      switch (msgType) {
        case 'execute_result':
        case 'display_data': {
          // Success! Unbundle the execution result, insert it into cell
          // outputs and then return the cell
          outputs.push(this.unbundle(response.content.data))
          break
        }
        case 'execute_reply': {
          // We get `execute_reply` messages when there is no
          // execution result (e.g. an assignment), or when evaluating
          // a user expression
          const result = response.content.user_expressions.value
          if (result !== undefined) {
            const { status, data, ename, evalue } = result
            if (status === 'ok') {
              outputs.push(this.unbundle(data))
            } else if (status === 'error') {
              errors.push(
                schema.codeError({
                  errorMessage: `${ename}: ${evalue}`,
                })
              )
            }
          }
          break
        }
        case 'error': {
          // Errrror :( Add an error message to the cell
          const error = response.content
          const { ename, evalue } = error
          errors.push(
            schema.codeError({
              errorMessage: `${ename}: ${evalue}`,
            })
          )
          break
        }
        default:
          log.debug(`Unhandled message type: ${msgType}`)
      }
    } catch (error) {
      // Some other error happened...
      errors.push(
        schema.codeError({
          errorMessage: error.message,
        })
      )
    }

    if (schema.isA('CodeExpression', node)) {
      return { ...node, output: outputs[0], errors }
    } else {
      return { ...node, outputs, errors }
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

    // Map of requests for handling response messages
    this.requests = {}

    const { transport, ip, key, shell_port, iopub_port } = this.config

    const origin = `${transport}://${ip}`

    // Shell socket for execute, and other, request
    this.shellSocket = new jmp.Socket('dealer', 'sha256', key)
    this.shellSocket.connect(`${origin}:${shell_port}`)
    this.shellSocket.on('message', this.response.bind(this))

    // IOPub socket for receiving updates
    this.ioSocket = new jmp.Socket('sub', 'sha256', key)
    this.ioSocket.connect(`${origin}:${iopub_port}`)
    this.ioSocket.on('message', this.response.bind(this))
    this.ioSocket.subscribe('') // Subscribe to all topics

    // Get kernel info mainly to confirm communication with kernel is
    // working
    const response: any = await this.request('kernel_info_request', {}, [
      'kernel_info_reply',
    ])
    this.kernelInfo = response.content

    // This wait seems to be necessary in order for messages to be received on
    // `this._ioSocket`.
    return new Promise((resolve) => setTimeout(resolve, 1000))
  }

  /**
   * Send a request message to the kernel
   *
   * @private
   * @param  requestType  Type of request e.g. 'execute'
   * @param  content      Content of message
   * @param  responseTypes Types of response message to resolve
   * @returns Promise resolving to the response messages
   */
  private request(
    requestType: string,
    content: Record<string, any>,
    responseTypes = ['execute_result', 'display_data', 'execute_reply', 'error']
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const msg_id = crypto.randomBytes(18).toString('hex')
      const request = new jmp.Message()
      request.idents = []
      request.header = {
        msg_id,
        username: 'user',
        session: this.id,
        msg_type: requestType,
        version: '5.2',
      }
      request.parent_header = {}
      request.metadata = {}
      request.content = content

      this.requests[msg_id] = {
        request,
        responseTypes,
        handler: resolve,
      }
      this.shellSocket.send(request)

      // If this request has not been handled before `timeout` throw an error
      if (this.timeout >= 0) {
        setTimeout(() => {
          if (this.requests[msg_id] !== undefined) {
            reject(new Error('Request timed out'))
          }
        }, this.timeout * 1000)
      }
    })
  }

  /**
   * Receive a response message from the kernel
   *
   * @param  response Response message
   */
  private response(response: Record<string, any>): void {
    const requestId = response.parent_header.msg_id
    const responseType = response.header.msg_type
    const request = this.requests[requestId]

    // First response matching the request, including response type
    // calls handler
    if (request?.responseTypes.indexOf(responseType) > -1) {
      request.handler(response)
      delete this.requests[requestId]
    }
  }

  /**
   * Convert a "MIME bundle" within a JMP message (e.g. a `execute_result` or
   * `display data` message) into a data node
   * e.g. `{'text/plain': 'Hello'}` to `{type: 'string', data: 'Hello'}`
   *
   * @param  bundle A JMP MIME bundle
   * @return A Stencila Schema node
   */
  private unbundle(bundle: Record<string, any>): schema.Node {
    const image = bundle['image/png']
    if (image !== undefined) {
      return schema.imageObject({
        contentUrl: `data:image/png;base64,${image}`,
      })
    }

    const text = bundle['text/plain']
    if (text !== undefined) {
      // Attempt to parse to JSON
      try {
        return JSON.parse(text)
      } catch (error) {
        return text
      }
    }

    return null
  }
}

// istanbul ignore next
if (require.main === module)
  cli.main(new Jupita()).catch((error) => log.error(error))
