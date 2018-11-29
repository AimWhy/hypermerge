
import Queue from "./Queue"
import * as Base58 from "bs58"
import * as crypto from "hypercore/lib/crypto"
import { ToBackendRepoMsg, ToFrontendRepoMsg } from "./RepoMsg"
import Handle from "./Handle"
import { DocFrontend } from "./DocFrontend"
import { clock2strs } from "./ClockSet"
import { Clock, clockDebug } from "./Clock"
import Debug from "debug"

Debug.formatters.b = Base58.encode

const log = Debug("repo:front")

export class RepoFrontend {
  toBackend: Queue<ToBackendRepoMsg> = new Queue("repo:tobackend")
  docs: Map<string, DocFrontend<any>> = new Map()

  create = () : string => {
    const keys = crypto.keyPair()
    const publicKey = Base58.encode(keys.publicKey)
    const secretKey = Base58.encode(keys.secretKey)
    const docId = publicKey
    const actorId = publicKey
    const doc = new DocFrontend(this, { actorId, docId })
    this.docs.set(docId, doc)
    this.toBackend.push({ type: "CreateMsg", publicKey, secretKey })
    return publicKey
  }

  open = <T>(id: string): Handle<T> => {
    const doc: DocFrontend<T> = this.docs.get(id) || this.openDocFrontend(id)
    return doc.handle()
  }

  state = <T>(id: string): Promise<T> => {
    return new Promise((resolve) => {
      const handle = this.open<T>(id)
      handle.subscribe( val => {
        resolve(val)
        handle.close()
      })
    })
  }

  debug(id :string) {
    const doc = this.docs.get(id)
    const short = id.substr(0,5)
    if (doc === undefined) {
      console.log(`doc:frontend undefined doc=${short}`)
    } else {
      console.log(`doc:frontend id=${short}`)
      console.log(`doc:frontend clock=${clockDebug(doc.clock)}`)
    }

    this.toBackend.push({ type: "DebugMsg", id })
  }

  fork = (clock: Clock) : string => {
    const id = this.create()
    this.merge(id, clock)
    return id
  }

  follow = (id: string, target: string) => {
    this.toBackend.push({ type: "FollowMsg", id, target })
  }

  merge = (id: string, clock: Clock) => {
    const actors = clock2strs(clock)
    this.toBackend.push({ type: "MergeMsg", id, actors })
  }

  private openDocFrontend<T>(id: string): DocFrontend<T> {
    const doc: DocFrontend<T> = new DocFrontend(this, { docId: id })
    this.toBackend.push({ type: "OpenMsg", id })
    this.docs.set(id, doc)
    return doc
  }

  subscribe = (subscriber: (message: ToBackendRepoMsg) => void) => {
    this.toBackend.subscribe(subscriber)
  }

  receive = (msg: ToFrontendRepoMsg) => {
    const doc = this.docs.get(msg.id)!
    switch (msg.type) {
      case "PatchMsg": {
        doc.patch(msg.patch)
        break
      }
      case "ActorIdMsg": {
        doc.setActorId(msg.actorId)
        break
      }
      case "ReadyMsg": {
        doc.init(msg.actorId, msg.patch)
        break
      }
    }
  }
}
