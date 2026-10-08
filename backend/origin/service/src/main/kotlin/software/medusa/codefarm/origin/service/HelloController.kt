package software.medusa.codefarm.origin.service

import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.http.annotation.Header

@Controller
class HelloController {
  @Get
  fun hello(@Header(callerEmailHeader) callerEmail: String): String =
      "Hello, $callerEmail, from Codefarm's origin"
}
