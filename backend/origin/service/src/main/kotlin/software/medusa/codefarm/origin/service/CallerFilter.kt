package software.medusa.codefarm.origin.service

import io.micronaut.http.HttpRequest
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.RequestFilter
import io.micronaut.http.annotation.ServerFilter

/**
 * Refuses API requests that don't name a caller. The edge always does, so a request without one
 * reached the service some other way, e.g. through a misconfiguration.
 */
@ServerFilter("/impl/api/**")
class CallerFilter {
  @RequestFilter
  fun requireCaller(request: HttpRequest<*>): HttpResponse<*>? =
      if (
          request.headers.contains(callerSubjectHeader) &&
              request.headers.contains(callerEmailHeader)
      ) {
        null
      } else {
        HttpResponse.status<Any>(HttpStatus.FORBIDDEN)
      }
}
