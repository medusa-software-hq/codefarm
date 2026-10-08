package software.medusa.codefarm.origin.service

import io.micronaut.runtime.Micronaut

fun main(args: Array<String>) {
  // Each of its lines would be a log entry of its own
  Micronaut.build(*args).banner(false).start()
}
