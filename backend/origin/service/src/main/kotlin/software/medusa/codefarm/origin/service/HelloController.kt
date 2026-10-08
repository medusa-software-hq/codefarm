package software.medusa.codefarm.origin.service

import io.micronaut.http.MediaType
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.http.annotation.Header
import io.micronaut.http.annotation.Produces

@Controller
class HelloController {
  @Get
  @Produces(MediaType.TEXT_PLAIN)
  fun hello(@Header(callerEmailHeader) callerEmail: String): String =
      "Hello, $callerEmail, from Codefarm's origin"
}
