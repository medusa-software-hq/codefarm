package software.medusa.codefarm.origin.service

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.micronaut.http.HttpRequest
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.http.client.HttpClient
import io.micronaut.http.client.annotation.Client
import io.micronaut.test.extensions.junit5.annotation.MicronautTest
import jakarta.inject.Inject
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import org.slf4j.LoggerFactory

/** Logs while handling a request, for the test to see what context the log gets. */
@Controller("/impl/api/logging")
class LoggingController {
  private val logger = LoggerFactory.getLogger(LoggingController::class.java)

  @Get
  fun log() {
    logger.info("Handling")
  }
}

@MicronautTest
class LogContextFilterTest {
  @Inject @field:Client("/") lateinit var client: HttpClient

  private val logger = LoggerFactory.getLogger(LoggingController::class.java) as Logger
  private val appender = ListAppender<ILoggingEvent>()

  @BeforeTest
  fun attachAppender() {
    appender.start()
    logger.addAppender(appender)
  }

  @AfterTest
  fun detachAppender() {
    logger.detachAppender(appender)
  }

  private fun logContextOf(request: HttpRequest<Any>): Map<String, String> {
    client.toBlocking().exchange(request, String::class.java)

    return appender.list.single().mdcPropertyMap
  }

  @Test
  fun `names the request's trace and caller in its logs`() {
    val logContext =
        logContextOf(
            HttpRequest.GET<Any>("/impl/api/logging")
                .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                .header(callerSubjectHeader, "person")
                .header(callerEmailHeader, "person@example.com"),
        )

    assertEquals(
        mapOf(
            traceIdKey to "0af7651916cd43dd8448eb211c80319c",
            callerEmailKey to "person@example.com",
        ),
        logContext,
    )
  }

  @Test
  fun `leaves out a malformed trace`() {
    val logContext =
        logContextOf(
            HttpRequest.GET<Any>("/impl/api/logging")
                .header("traceparent", "00-not-a-trace-01")
                .header(callerSubjectHeader, "person")
                .header(callerEmailHeader, "person@example.com"),
        )

    assertEquals(mapOf(callerEmailKey to "person@example.com"), logContext)
  }
}
