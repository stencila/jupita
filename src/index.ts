import crypto from 'crypto'
import fs from 'fs'
// @ts-ignore
import jmp from 'jmp'
// @ts-ignore
import kernelspecs from 'kernelspecs'
// @ts-ignore
import spawnteract from 'spawnteract'

type Dict = { [key: string]: any }

// Disable camel case check because used quite a bit in JMP API
/* eslint-disable camelcase */

export class Jupita {
  /**
   * A list of kernels available on this machine
   */
  static kernels: any = {}

  kernel: string

  debug = false

  /**
   * Timeout for responses from the kernel.
   */
  timeout = -1

  process: any
  connectionFile: any
  config: any
  spec: any
  sessionId: any
  requests: any
  shellSocket: any
  ioSocket: any
  kernelInfo: any

  /**
   * Discover Jupyter kernels on the current machine
   *
   * Looks for Jupyter kernels that have been installed on the system
   * and puts that list in `JupyterContext.kernels` so that
   * peers know the capabilities of this "meta-context".
   *
   * This method should be called initially to find all Jupyter kernels
   * currently installed on the machine and update `JupyterContext.kernels`:
   *
   *     JupyterContext.discover()
   */
  static discover(): Promise<void> {
    // Create a list of kernel names and aliases
    return kernelspecs.findAll().then((kernelspecs: any) => {
      Jupita.kernels = kernelspecs
    })
  }

  /**
   * Construct a Jupyter executor.
   *
   * New Jupyter execution contexts can be constructed using the `language` option which will
   * search for a kernel with a matching lowercased `language` property:
   *
   *     new JupyterContext({language:'r'})
   *
   * Alternively, you can specify a kernel directly:
   *
   *     new JupyterContext({kernel:'ir'})
   *
   * See https://github.com/jupyter/jupyter/wiki/Jupyter-kernels for a list of available
   * Jupyter kernels.
   *
   * @param options Options e.g for specifying which kernel to use
   */
  constructor(options: Record<string, any> = {}) {
    let { kernel, name, debug, timeout } = options

    const kernels = Jupita.kernels
    const kernelNames = Object.keys(kernels)

    if (kernelNames.length === 0) {
      throw new Error('No Jupyter kernels available on this machine')
    }
    if (kernel !== undefined && kernels[kernel] === undefined) {
      throw new Error(
        `Jupyter kernel "${kernel}" not available on this machine`
      )
    }
    if (name !== undefined) {
      for (const spec of kernels) {
        if (spec.name.toLowerCase() === name) {
          kernel = spec.name
          break
        }
      }
      if (kernel === undefined) {
        throw new Error(`No Jupyter kernel on this machine with name "${name}"`)
      }
    }
    if (kernel === undefined) {
      if (kernelNames.includes('python3')) kernel = 'python3'
      else kernel = kernelNames[0]
    }
    this.kernel = kernel

    if (debug !== undefined) this.debug = debug
    if (timeout !== undefined) this.timeout = timeout
  }

  /**
   * Initialize the context.
   */
  async initialize(): Promise<void> {
    if (this.process === undefined) {
      // Options to [child_process.spawn]{@link https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options}
      const options = {}
      // Pass `kernels` to `launch()` as an optimization to prevent another kernelspecs search of filesystem
      const kernel = await spawnteract.launch(
        this.kernel,
        options,
        Jupita.kernels
      )
      this.process = kernel.spawn // The running process, from child_process.spawn(...)
      this.connectionFile = kernel.connectionFile // Connection file path
      this.config = kernel.config // Connection information from the file
      this.spec = kernel.kernelSpec

      // Unique session id for requests
      this.sessionId = uuid()

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
  }

  /**
   * Finalize the executor.
   *
   * Performs various cleanup actions.
   */
  finalize(): void {
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
  }

  /**
   * Compile a cell
   *
   * @param cell Cell to compile
   */
  compile(cell: any): Dict {
    let source
    if (typeof cell === 'string' || cell instanceof String) {
      source = cell
    } else {
      source = cell.source.data
    }

    return {
      source: {
        type: 'string',
        data: source,
      },
      expr: cell.expr ?? false,
      global: cell.global ?? false,
      options: {},
      inputs: [],
      outputs: [],
      messages: [],
    }
  }

  /**
   * Execute a cell
   *
   * For cells with `expr: true` utilizes `user_expressions` property of an `execute_request` to
   * evaluate expression side-effect free.
   *
   * @override
   */
  async execute(cell: Dict | string): Promise<Dict> {
    // Compile the cell so it has correct structure
    cell = this.compile(cell)

    // For expression cells, use `user_expressions`, not `code`
    // to ensure there are no side effects (?)
    let code
    let expressions
    if (cell.expr === true) {
      code = ''
      expressions = {
        value: cell.source.data,
      }
    } else {
      code = cell.source.data
      expressions = {}
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
    try {
      const response = await this.request('execute_request', content)
      const msgType = response.header.msg_type
      switch (msgType) {
        case 'execute_result':
        case 'display_data': {
          // Success! Unbundle the execution result, insert it into cell
          // outputs and then return the cell
          const value = this.unbundle(response.content.data)
          cell.outputs.push({ value })
          return cell
        }
        case 'execute_reply': {
          // We get `execute_reply` messages when there is no
          // execution result (e.g. an assignment), or when evaluating
          // a user expression
          const result = response.content.user_expressions.value
          if (result !== undefined) {
            const { status, data, ename, evalue } = result
            if (status === 'ok') {
              const value = this.unbundle(data)
              cell.outputs.push({ value })
              return cell
            } else if (status === 'error') {
              cell.messages.push({
                type: 'error',
                message: `${ename}: ${evalue}`,
              })
              return cell
            }
          } else {
            return cell
          }
          break
        }
        case 'error': {
          // Errrror :( Add an error message to the cell
          const error = response.content
          const { ename, evalue } = error
          cell.messages.push({
            type: 'error',
            message: `${ename}: ${evalue}`,
          })
          return cell
        }
        default:
          if (this.debug) console.log(`Unhandled message type: ${msgType}`)
          return cell
      }
    } catch (error) {
      // Some other error happened...
      cell.messages.push({
        type: 'error',
        message: error.message,
      })
    }
    return cell
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
    content: Dict,
    responseTypes = ['execute_result', 'display_data', 'execute_reply', 'error']
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = new jmp.Message()
      request.idents = []
      request.header = {
        msg_id: uuid(),
        username: 'user',
        session: this.sessionId,
        msg_type: requestType,
        version: '5.2',
      }
      request.parent_header = {}
      request.metadata = {}
      request.content = content

      this.requests[request.header.msg_id] = {
        request,
        responseTypes,
        handler: (response: Dict) => resolve(response),
      }
      this.shellSocket.send(request)

      // If this request has not been handled before `timeout` throw an error
      if (this.timeout >= 0) {
        setTimeout(() => {
          if (this.requests[request.header.msg_id] !== undefined) {
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
  private response(response: Dict): void {
    const requestId = response.parent_header.msg_id
    const responseType = response.header.msg_type
    const request = this.requests[requestId]
    if (this.debug) {
      console.log('Response: ', requestId, responseType, response.content)
    }
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
   * @return Promise resolving to a data node
   */
  private unbundle(bundle: Dict): Dict {
    const value = (function () {
      const image = bundle['image/png']
      if (image !== undefined) {
        return {
          type: 'image',
          src: `data:image/png;base64,${image}`,
        }
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
    })()
    return value
  }
}

function uuid(): string {
  return crypto.randomBytes(18).toString('hex')
}
