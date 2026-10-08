package software.medusa.codefarm.origin.service

/** Who the edge says Cloudflare Access signed in; only the edge may call this service. */
const val callerSubjectHeader = "x-codefarm-caller-subject"

const val callerEmailHeader = "x-codefarm-caller-email"
