/** Declaration for experimental, non-published Node SQLite candidate. */
export declare class SqliteWorkCandidate {
  constructor(privateDirectory:string)
  commitCompleted(fingerprint:string,utcDay:string,completedTurnMs:number):boolean
  count(utcDay:string):number
  integrity():boolean
  beginUncommittedForTest(fingerprint:string,utcDay:string,completedTurnMs:number):void
  close():void
}
