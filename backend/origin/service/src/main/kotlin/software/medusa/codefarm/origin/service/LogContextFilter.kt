package software.medusa.codefarm.origin.service

import io.micronaut.context.propagation.slf4j.MdcPropagationContext
import io.micronaut.core.propagation.MutablePropagatedContext
import io.micronaut.http.HttpRequest
import io.micronaut.http.annotation.Filter
import io.micronaut.http.annotation.RequestFilter
import io.micronaut.http.annotation.ServerFilter

const val traceIdKey = "traceId"

const val callerEmailKey = "callerEmail"

/** Cloud Run's trace context header, as the W3C defines it; its second field is the trace ID. */
private val traceparentPattern = Regex("^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$")

/** Names each request's trace and caller in the logs written while handling it. */
@ServerFilter(Filter.MATCH_ALL_PATTERN)
class LogContextFilter {
  @RequestFilter
  fun addLogContext(request: HttpRequest<*>, propagatedContext: MutablePropagatedContext) {
    val traceparent = request.headers.get("traceparent")
    val traceId = traceparent?.let { traceparentPattern.matchEntire(it)?.groupValues?.get(1) }
    val callerEmail = request.headers.get(callerEmailHeader)

    val logContext = buildMap {
      traceId?.let { put(traceIdKey, it) }
      callerEmail?.let { put(callerEmailKey, it) }
    }

    propagatedContext.add(MdcPropagationContext(logContext))
  }
}
