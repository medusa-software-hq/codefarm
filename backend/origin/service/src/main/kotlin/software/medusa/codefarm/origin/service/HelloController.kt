package software.medusa.codefarm.origin.service

import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get

@Controller
class HelloController {
  @Get fun hello(): String = "Hello from Codefarm's origin"
}
