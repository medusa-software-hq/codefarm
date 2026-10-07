package software.medusa.codefarm.origin.service

import io.micronaut.http.client.HttpClient
import io.micronaut.http.client.annotation.Client
import io.micronaut.test.extensions.junit5.annotation.MicronautTest
import jakarta.inject.Inject
import kotlin.test.Test
import kotlin.test.assertEquals

@MicronautTest
class HelloControllerTest {
  @Inject @field:Client("/") lateinit var client: HttpClient

  @Test
  fun `says hello`() {
    assertEquals("Hello from Codefarm's origin", client.toBlocking().retrieve("/"))
  }
}
