package software.medusa.codefarm.origin.service

import io.micronaut.http.HttpRequest
import io.micronaut.http.HttpStatus
import io.micronaut.http.MediaType
import io.micronaut.http.client.HttpClient
import io.micronaut.http.client.annotation.Client
import io.micronaut.http.client.exceptions.HttpClientResponseException
import io.micronaut.test.extensions.junit5.annotation.MicronautTest
import jakarta.inject.Inject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@MicronautTest
class HelloControllerTest {
  @Inject @field:Client("/") lateinit var client: HttpClient

  @Test
  fun `greets the caller the edge names`() {
    val request =
        HttpRequest.GET<Any>("/")
            .header(callerSubjectHeader, "person")
            .header(callerEmailHeader, "person@example.com")

    val response = client.toBlocking().exchange(request, String::class.java)

    assertEquals("Hello, person@example.com, from Codefarm's origin", response.body())
    assertEquals(MediaType.TEXT_PLAIN_TYPE, response.contentType.orElse(null))
  }

  @Test
  fun `refuses a request that names no caller`() {
    val error = assertFailsWith<HttpClientResponseException> { client.toBlocking().retrieve("/") }

    assertEquals(HttpStatus.FORBIDDEN, error.status)
  }
}
